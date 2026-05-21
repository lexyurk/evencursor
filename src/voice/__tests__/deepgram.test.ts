import { afterEach, describe, expect, it, vi } from "vitest";
import { DeepgramLive } from "../deepgram.js";

type WebSocketHandler = ((event: unknown) => void) | null;

class MockWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: MockWebSocket[] = [];

  url: string;
  protocols: string[] | string | undefined;
  readyState = MockWebSocket.CONNECTING;
  onopen: WebSocketHandler = null;
  onmessage: WebSocketHandler = null;
  onerror: WebSocketHandler = null;
  onclose: WebSocketHandler = null;
  sent: Array<ArrayBuffer | string> = [];

  constructor(url: string, protocols?: string[] | string) {
    this.url = url;
    this.protocols = protocols;
    MockWebSocket.instances.push(this);
  }

  send(data: ArrayBuffer | string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({});
  }

  simulateOpen(): void {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.({});
  }

  simulateMessage(data: string): void {
    this.onmessage?.({ data });
  }
}

afterEach(() => {
  MockWebSocket.instances = [];
  vi.unstubAllGlobals();
});

describe("DeepgramLive", () => {
  it("authenticates with token subprotocol and keeps key out of the URL", async () => {
    vi.stubGlobal("WebSocket", MockWebSocket);

    const client = new DeepgramLive("dg-secret-key");
    const startPromise = client.start();
    const ws = MockWebSocket.instances[0];

    expect(ws.url).toContain("wss://api.deepgram.com/v1/listen?");
    expect(ws.url).not.toContain("dg-secret-key");
    expect(ws.url).not.toContain("api_key");
    expect(ws.protocols).toEqual(["token", "dg-secret-key"]);

    ws.simulateOpen();
    await startPromise;
  });

  it("forwards PCM bytes via sendPcm", async () => {
    vi.stubGlobal("WebSocket", MockWebSocket);

    const client = new DeepgramLive("dg-secret-key");
    const startPromise = client.start();
    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();
    await startPromise;

    const pcm = new Uint8Array([1, 2, 3, 4]);
    client.sendPcm(pcm);

    expect(ws.sent).toHaveLength(1);
    expect(new Uint8Array(ws.sent[0] as ArrayBuffer)).toEqual(pcm);
  });

  it("emits transcript events for Results messages", async () => {
    vi.stubGlobal("WebSocket", MockWebSocket);

    const client = new DeepgramLive("dg-secret-key");
    const transcripts: Array<{
      transcript: string;
      isFinal: boolean;
      speechFinal: boolean;
      words: Array<{ word: string; start: number; end: number }>;
    }> = [];
    client.on("transcript", (payload) => transcripts.push(payload));

    const startPromise = client.start();
    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();
    await startPromise;

    ws.simulateMessage(
      JSON.stringify({
        type: "Results",
        channel: {
          alternatives: [
            {
              transcript: "hello world",
              words: [{ word: "hello", start: 0, end: 0.4 }],
            },
          ],
        },
        is_final: true,
        speech_final: true,
      })
    );

    expect(transcripts).toEqual([
      {
        transcript: "hello world",
        isFinal: true,
        speechFinal: true,
        words: [{ word: "hello", start: 0, end: 0.4 }],
      },
    ]);
  });
});
