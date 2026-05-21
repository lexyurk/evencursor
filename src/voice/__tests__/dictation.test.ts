import { afterEach, describe, expect, it, vi } from "vitest";
import { Emitter } from "../../shared/events.js";
import { DeepgramLive } from "../deepgram.js";
import { DictationSession } from "../dictation.js";
import type { DeepgramLiveEvents, DeepgramTranscript } from "../types.js";

class MockDeepgram extends Emitter<DeepgramLiveEvents> {
  async start(): Promise<void> {
    this.emit("open", undefined);
  }

  keepAlive(): void {}

  sendPcm(): void {}

  async close(): Promise<void> {
    this.emit("close", undefined);
  }

  push(chunk: DeepgramTranscript): void {
    this.emit("transcript", chunk);
  }
}

describe("DictationSession", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("appends final transcript on speech_final", async () => {
    const target = document.createElement("textarea");
    document.body.appendChild(target);
    const mock = new MockDeepgram();

    const session = new DictationSession({
      apiKey: "test",
      target,
      openMic: async () => () => {},
      createDeepgram: (() => mock) as unknown as (apiKey: string) => DeepgramLive
    });

    await session.start();
    mock.push({ transcript: "hello world", isFinal: true, speechFinal: true, words: [] });
    expect(target.value).toBe("hello world");
    session.stop();
  });

  it("shows interim preview text", async () => {
    const target = document.createElement("textarea");
    document.body.appendChild(target);
    const mock = new MockDeepgram();

    const session = new DictationSession({
      apiKey: "test",
      target,
      openMic: async () => () => {},
      createDeepgram: (() => mock) as unknown as (apiKey: string) => DeepgramLive
    });

    await session.start();
    mock.push({ transcript: "partial", isFinal: false, speechFinal: false, words: [] });

    const preview = document.querySelector(".dictation-preview-text");
    expect(preview?.textContent).toBe("partial");
    expect((preview as HTMLElement | null)?.style.fontStyle).toBe("italic");
    session.stop();
  });

  it("commit insert clears preview and appends interim", async () => {
    const target = document.createElement("textarea");
    document.body.appendChild(target);
    const mock = new MockDeepgram();

    const session = new DictationSession({
      apiKey: "test",
      target,
      openMic: async () => () => {},
      createDeepgram: (() => mock) as unknown as (apiKey: string) => DeepgramLive
    });

    await session.start();
    mock.push({ transcript: "draft line", isFinal: false, speechFinal: false, words: [] });

    const insertBtn = document.querySelector<HTMLButtonElement>(".btn-dictation-insert");
    insertBtn?.click();

    expect(target.value).toBe("draft line");
    expect(document.querySelector(".dictation-preview-text")?.textContent).toBe("");
    session.stop();
  });

  it("cancel discards interim without appending", async () => {
    const target = document.createElement("textarea");
    target.value = "keep";
    document.body.appendChild(target);
    const mock = new MockDeepgram();

    const session = new DictationSession({
      apiKey: "test",
      target,
      openMic: async () => () => {},
      createDeepgram: (() => mock) as unknown as (apiKey: string) => DeepgramLive
    });

    await session.start();
    mock.push({ transcript: "discard me", isFinal: false, speechFinal: false, words: [] });

    document.querySelector<HTMLButtonElement>(".btn-dictation-cancel")?.click();
    expect(target.value).toBe("keep");
    session.stop();
  });
});
