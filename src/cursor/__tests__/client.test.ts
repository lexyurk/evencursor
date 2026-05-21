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
