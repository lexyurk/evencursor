import { Emitter } from "../shared/events.js";
import type { DeepgramLiveEvents } from "./types.js";

export class DeepgramLive extends Emitter<DeepgramLiveEvents> {
  constructor(
    private readonly apiKey: string,
    private readonly opts?: { model?: string; sampleRate?: number }
  ) {
    super();
  }

  async start(): Promise<void> {
    throw new Error("not implemented: start");
  }

  sendPcm(chunk: ArrayBuffer | Uint8Array): void {
    throw new Error("not implemented: sendPcm");
  }

  keepAlive(): void {
    throw new Error("not implemented: keepAlive");
  }

  async close(): Promise<void> {
    throw new Error("not implemented: close");
  }
}
