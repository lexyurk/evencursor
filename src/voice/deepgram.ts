import { Emitter } from "../shared/events.js";
import type { DeepgramLiveEvents, DeepgramTranscript } from "./types.js";

const DEFAULT_MODEL = "nova-3";
const DEFAULT_SAMPLE_RATE = 16000;
const KEEP_ALIVE_MS = 8000;

type DeepgramResultsMessage = {
  type: string;
  channel?: {
    alternatives?: Array<{
      transcript?: string;
      words?: Array<{ word: string; start: number; end: number }>;
    }>;
  };
  is_final?: boolean;
  speech_final?: boolean;
};

function buildListenUrl(model: string, sampleRate: number): string {
  const params = new URLSearchParams({
    model,
    smart_format: "true",
    interim_results: "true",
    encoding: "linear16",
    sample_rate: String(sampleRate),
    channels: "1",
  });
  return `wss://api.deepgram.com/v1/listen?${params.toString()}`;
}

function parseResultsMessage(message: DeepgramResultsMessage): DeepgramTranscript | null {
  if (message.type !== "Results") {
    return null;
  }

  const alternative = message.channel?.alternatives?.[0];
  if (!alternative) {
    return null;
  }

  return {
    transcript: alternative.transcript ?? "",
    isFinal: message.is_final ?? false,
    speechFinal: message.speech_final ?? false,
    words: (alternative.words ?? []).map((word) => ({
      word: word.word,
      start: word.start,
      end: word.end,
    })),
  };
}

export class DeepgramLive extends Emitter<DeepgramLiveEvents> {
  private ws: WebSocket | null = null;
  private keepAliveTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly apiKey: string,
    private readonly opts?: { model?: string; sampleRate?: number }
  ) {
    super();
  }

  async start(): Promise<void> {
    if (this.ws) {
      await this.close();
    }

    const model = this.opts?.model ?? DEFAULT_MODEL;
    const sampleRate = this.opts?.sampleRate ?? DEFAULT_SAMPLE_RATE;
    const url = buildListenUrl(model, sampleRate);

    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(url, ["token", this.apiKey]);
      this.ws = ws;

      ws.onopen = () => {
        this.emit("open", undefined);
        resolve();
      };

      ws.onmessage = (event) => {
        if (typeof event.data !== "string") {
          return;
        }

        let parsed: unknown;
        try {
          parsed = JSON.parse(event.data);
        } catch {
          return;
        }

        if (!parsed || typeof parsed !== "object") {
          return;
        }

        const transcript = parseResultsMessage(parsed as DeepgramResultsMessage);
        if (transcript) {
          this.emit("transcript", transcript);
        }
      };

      ws.onerror = () => {
        const error = new Error("Deepgram WebSocket error");
        this.emit("error", error);
        reject(error);
      };

      ws.onclose = () => {
        this.emit("close", undefined);
      };
    });
  }

  sendPcm(chunk: ArrayBuffer | Uint8Array): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const buffer =
      chunk instanceof ArrayBuffer
        ? chunk
        : chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength);

    this.ws.send(buffer);
  }

  keepAlive(): void {
    this.stopKeepAlive();
    this.keepAliveTimer = setInterval(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        return;
      }
      this.ws.send(JSON.stringify({ type: "KeepAlive" }));
    }, KEEP_ALIVE_MS);
  }

  async close(): Promise<void> {
    this.stopKeepAlive();

    const ws = this.ws;
    this.ws = null;
    if (!ws) {
      return;
    }

    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "CloseStream" }));
    }

    await new Promise<void>((resolve) => {
      if (ws.readyState === WebSocket.CLOSED) {
        resolve();
        return;
      }

      ws.onclose = () => resolve();
      ws.close();
    });
  }

  private stopKeepAlive(): void {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
  }
}
