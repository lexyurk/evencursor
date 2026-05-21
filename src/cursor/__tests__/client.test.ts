import { afterEach, describe, expect, it, vi } from "vitest";
import { basicAuthHeader } from "../auth.js";
import {
  CursorApiError,
  CursorClient,
  mapSseBlockToRunStreamEvent,
  parseSseBlocks,
  withRetry
} from "../client.js";

const RECORDED_SSE = `id: evt-1
event: status
data: {"status":"RUNNING"}

id: evt-2
event: assistant
data: {"delta":"Hello"}

: keep-alive

id: evt-3
event: done
data: {}

`;

describe("basicAuthHeader", () => {
  it("formats Basic auth with trailing colon", () => {
    const key = "cur_test_key";
    expect(basicAuthHeader(key)).toBe(`Basic ${btoa(`${key}:`)}`);
  });
});

describe("CursorApiError", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("parses error.code and error.message from a 401 JSON body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { code: "unauthorized", message: "Invalid API key" }
        }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new CursorClient("bad-key");
    await expect(client.me()).rejects.toMatchObject({
      name: "CursorApiError",
      status: 401,
      code: "unauthorized",
      message: "Invalid API key"
    } satisfies Partial<CursorApiError>);
  });
});

describe("SSE parsing", () => {
  it("splits recorded stream fragments into event blocks", () => {
    const { blocks, remainder } = parseSseBlocks(RECORDED_SSE);
    expect(remainder).toBe("");
    expect(blocks).toHaveLength(3);
    expect(blocks[0]).toMatchObject({
      id: "evt-1",
      event: "status",
      data: '{"status":"RUNNING"}'
    });
    expect(blocks[1]).toMatchObject({
      id: "evt-2",
      event: "assistant",
      data: '{"delta":"Hello"}'
    });
    expect(blocks[2]).toMatchObject({ id: "evt-3", event: "done" });
  });

  it("maps assistant and status blocks to RunStreamEvent", () => {
    const { blocks } = parseSseBlocks(RECORDED_SSE);
    expect(mapSseBlockToRunStreamEvent(blocks[0])).toEqual({
      type: "status",
      status: "RUNNING",
      raw: { status: "RUNNING" }
    });
    expect(mapSseBlockToRunStreamEvent(blocks[1])).toEqual({
      type: "assistant",
      delta: "Hello",
      raw: { delta: "Hello" }
    });
    expect(mapSseBlockToRunStreamEvent(blocks[2])?.type).toBe("done");
  });

  it("retains a partial block across chunk boundaries", () => {
    const splitAt = RECORDED_SSE.indexOf("event: assistant");
    const first = RECORDED_SSE.slice(0, splitAt);
    const second = RECORDED_SSE.slice(splitAt);

    const pass1 = parseSseBlocks(first);
    expect(pass1.blocks).toHaveLength(1);
    expect(pass1.remainder.length).toBeGreaterThan(0);

    const pass2 = parseSseBlocks(pass1.remainder + second);
    expect(pass2.blocks.length + pass1.blocks.length).toBe(3);
  });
});

const COMPOSER_25_MODELS_FIXTURE = `{
  "items": [
    {
      "id": "composer-2.5",
      "displayName": "Composer 2.5",
      "parameters": [
        {
          "id": "fast",
          "displayName": "Speed",
          "values": [
            { "value": "true", "displayName": "Fast" },
            { "value": "false", "displayName": "Thinking" }
          ]
        }
      ],
      "variants": [
        {
          "params": [{ "id": "fast", "value": "true" }],
          "displayName": "Composer 2.5 (fast)",
          "isDefault": true
        },
        {
          "params": [{ "id": "fast", "value": "false" }],
          "displayName": "Composer 2.5 (thinking)"
        }
      ]
    }
  ]
}`;

describe("agent lifecycle and models", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("archiveAgent resolves on 200 and throws CursorApiError on 404", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ error: { code: "not_found", message: "Missing" } }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        )
      );
    vi.stubGlobal("fetch", fetchMock);

    const client = new CursorClient("key");
    await expect(client.archiveAgent("agent-1")).resolves.toBeUndefined();
    await expect(client.archiveAgent("missing")).rejects.toMatchObject({
      status: 404,
      message: "Missing"
    });
    expect(fetchMock.mock.calls[0]?.[0]).toContain("/archive");
  });

  it("deleteAgent uses DELETE", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    const client = new CursorClient("key");
    await client.deleteAgent("agent-del");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.cursor.com/v1/agents/agent-del",
      expect.objectContaining({ method: "DELETE" })
    );
  });

  it("listModels parses composer-2.5 catalog shape", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(COMPOSER_25_MODELS_FIXTURE, {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new CursorClient("key");
    const catalog = await client.listModels();
    expect(catalog.items).toHaveLength(1);
    expect(catalog.items[0]?.id).toBe("composer-2.5");
    expect(catalog.items[0]?.variants?.[0]).toMatchObject({
      displayName: "Composer 2.5 (fast)",
      isDefault: true,
      params: [{ id: "fast", value: "true" }]
    });
  });
});

describe("withRetry", () => {
  it("retries 429 responses up to three attempts", async () => {
    let calls = 0;
    await expect(
      withRetry(async () => {
        calls += 1;
        if (calls < 3) {
          throw new CursorApiError(429, "Rate limited");
        }
        return "ok";
      })
    ).resolves.toBe("ok");
    expect(calls).toBe(3);
  });
});
