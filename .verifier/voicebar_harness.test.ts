// Verification harness for the parseTranscript -> VoiceBar command bus
// round-trip described in the verifier prompt. Mocks DeepgramLive,
// BrowserMic, and the keystore so we can drive a fake `speech_final`
// event through the real VoiceBar.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockDeepgramTranscriptHandler: { handler?: (chunk: any) => void } = {};

vi.mock("/workspace/src/cursor/auth.js", () => ({
  getDeepgramApiKey: async () => "fake-deepgram-key",
}));

vi.mock("/workspace/src/voice/deepgram.js", () => ({
  DeepgramLive: class {
    constructor(_apiKey: string) {}
    async start() {}
    keepAlive() {}
    sendPcm(_buf: Uint8Array) {}
    on(event: string, handler: (chunk: any) => void) {
      if (event === "transcript") mockDeepgramTranscriptHandler.handler = handler;
      return () => {
        if (event === "transcript") mockDeepgramTranscriptHandler.handler = undefined;
      };
    }
    async close() {}
  },
}));

vi.mock("/workspace/src/voice/mic.js", () => ({
  BrowserMic: class {
    async start(_onPcm: any) {}
    async stop() {}
  },
}));

import { mountVoiceBar, type VoiceCommand } from "/workspace/src/ui/VoiceBar.js";

describe("VoiceBar speech_final command bus round-trip", () => {
  let root: HTMLElement;
  beforeEach(() => {
    root = document.createElement("div");
    document.body.appendChild(root);
    mockDeepgramTranscriptHandler.handler = undefined;
  });
  afterEach(() => {
    root.remove();
  });

  async function startListening(commands: VoiceCommand[]) {
    const teardown = mountVoiceBar({
      root,
      onCommand: (cmd) => commands.push(cmd),
    });
    const micBtn = root.querySelector<HTMLButtonElement>(".btn-mic")!;
    micBtn.click();
    // Allow startSession's awaits to resolve
    for (let i = 0; i < 5; i++) await Promise.resolve();
    return teardown;
  }

  it("dispatches /refresh on speech_final", async () => {
    const commands: VoiceCommand[] = [];
    const teardown = await startListening(commands);
    expect(mockDeepgramTranscriptHandler.handler).toBeTypeOf("function");
    mockDeepgramTranscriptHandler.handler!({
      transcript: "slash refresh",
      isFinal: true,
      speechFinal: true,
      words: [],
    });
    expect(commands).toEqual([{ verb: "refresh" }]);
    teardown();
  });

  it("dispatches /select with index", async () => {
    const commands: VoiceCommand[] = [];
    const teardown = await startListening(commands);
    mockDeepgramTranscriptHandler.handler!({
      transcript: "/select 3",
      isFinal: true,
      speechFinal: true,
      words: [],
    });
    expect(commands).toEqual([{ verb: "select", index: 3 }]);
    teardown();
  });

  it("dispatches /new with prompt rest", async () => {
    const commands: VoiceCommand[] = [];
    const teardown = await startListening(commands);
    mockDeepgramTranscriptHandler.handler!({
      transcript: "slash new fix the auth regression",
      isFinal: true,
      speechFinal: true,
      words: [],
    });
    expect(commands).toEqual([
      { verb: "new", rest: "fix the auth regression" },
    ]);
    teardown();
  });

  it("dispatches /follow up with rest", async () => {
    const commands: VoiceCommand[] = [];
    const teardown = await startListening(commands);
    mockDeepgramTranscriptHandler.handler!({
      transcript: "/follow up add a test for null user",
      isFinal: true,
      speechFinal: true,
      words: [],
    });
    expect(commands).toEqual([
      { verb: "followup", rest: "add a test for null user" },
    ]);
    teardown();
  });

  it("dispatches /sign out as signout verb", async () => {
    const commands: VoiceCommand[] = [];
    const teardown = await startListening(commands);
    mockDeepgramTranscriptHandler.handler!({
      transcript: "/sign out",
      isFinal: true,
      speechFinal: true,
      words: [],
    });
    expect(commands).toEqual([{ verb: "signout" }]);
    teardown();
  });

  it("does not dispatch on interim transcript without speech_final", async () => {
    const commands: VoiceCommand[] = [];
    const teardown = await startListening(commands);
    mockDeepgramTranscriptHandler.handler!({
      transcript: "/refresh",
      isFinal: false,
      speechFinal: false,
      words: [],
    });
    expect(commands).toEqual([]);
    teardown();
  });

  it("ignores transcripts without commands", async () => {
    const commands: VoiceCommand[] = [];
    const teardown = await startListening(commands);
    mockDeepgramTranscriptHandler.handler!({
      transcript: "draft a follow-up for the auth bug",
      isFinal: true,
      speechFinal: true,
      words: [],
    });
    expect(commands).toEqual([]);
    teardown();
  });
});
