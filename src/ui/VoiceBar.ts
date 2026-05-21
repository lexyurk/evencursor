import { getDeepgramApiKey } from "../cursor/auth.js";
import { parseTranscript } from "../voice/commands.js";
import { DeepgramLive } from "../voice/deepgram.js";
import { BrowserMic } from "../voice/mic.js";
import type { CommandToken } from "../voice/types.js";

export type VoiceCommand =
  | { verb: "new"; rest: string; direct?: boolean }
  | { verb: "cancel" }
  | { verb: "followup"; rest: string; direct?: boolean }
  | { verb: "refresh" }
  | { verb: "select"; index: number }
  | { verb: "open"; repo: string }
  | { verb: "signin" }
  | { verb: "signout" }
  | { verb: "archive" }
  | { verb: "unarchive" }
  | { verb: "delete" };

export type VoiceIntent =
  | { kind: "command" }
  | { kind: "dictate" }
  | { kind: "newAgent" }
  | { kind: "followup" };

export type VoiceBarDeps = {
  root: HTMLElement;
  onCommand: (command: VoiceCommand) => void;
  glassesMicAvailable?: boolean;
  openGlassesMic?: (onPcm: (frame: Uint8Array) => void) => Promise<() => void>;
  onListeningChange?: (active: boolean) => void;
  onTranscript?: (text: string, speechFinal: boolean) => void;
};

function mapCommandToken(token: CommandToken): VoiceCommand | null {
  switch (token.verb) {
    case "new":
      return { verb: "new", rest: token.rest };
    case "cancel":
      return { verb: "cancel" };
    case "followup":
      return { verb: "followup", rest: token.rest };
    case "refresh":
      return { verb: "refresh" };
    case "select": {
      const index = Number.parseInt(token.rest.trim(), 10);
      if (!Number.isFinite(index)) {
        return null;
      }
      return { verb: "select", index };
    }
    case "open":
      return { verb: "open", repo: token.rest.trim() };
    case "signin":
      return { verb: "signin" };
    case "signout":
      return { verb: "signout" };
    case "archive":
      return { verb: "archive" };
    case "unarchive":
      return { verb: "unarchive" };
    case "delete":
      return { verb: "delete" };
    default:
      return null;
  }
}

function appendToFocusedField(text: string): boolean {
  const active = document.activeElement;
  if (
    active instanceof HTMLTextAreaElement ||
    active instanceof HTMLInputElement
  ) {
    const trimmed = text.trim();
    if (!trimmed) {
      return false;
    }
    const prefix =
      active.value.length > 0 && !active.value.endsWith(" ") ? " " : "";
    active.value = `${active.value}${prefix}${trimmed}`;
    active.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  }
  return false;
}

export type VoiceBarHandle = {
  destroy: () => void;
  stop: (opts?: { commit?: boolean }) => void;
  isListening: () => boolean;
  startForIntent: (intent: VoiceIntent) => Promise<void>;
  getIntent: () => VoiceIntent;
};

export function mountVoiceBar(deps: VoiceBarDeps): VoiceBarHandle {
  const {
    root,
    onCommand,
    glassesMicAvailable,
    openGlassesMic,
    onListeningChange,
    onTranscript
  } = deps;

  root.innerHTML = `
    <section class="voice-bar">
      <button type="button" class="btn-mic" aria-pressed="false" aria-label="Toggle microphone">
        <span class="btn-mic-icon" aria-hidden="true">🎤</span>
        <span class="btn-mic-label">Tap to speak</span>
      </button>
      <p class="voice-transcript muted" aria-live="polite">Tap mic, then say a slash command or click + New agent</p>
    </section>
  `;

  const micBtn = root.querySelector<HTMLButtonElement>(".btn-mic");
  const transcriptEl = root.querySelector<HTMLElement>(".voice-transcript");
  const micLabel = root.querySelector<HTMLElement>(".btn-mic-label");

  let listening = false;
  let intent: VoiceIntent = { kind: "command" };
  let promptBuffer = "";
  let deepgram: DeepgramLive | undefined;
  let browserMic: BrowserMic | undefined;
  let stopGlassesMic: (() => void) | undefined;
  let unsubTranscript: (() => void) | undefined;
  let destroyed = false;

  const setTranscript = (text: string): void => {
    if (transcriptEl) {
      transcriptEl.textContent = text;
    }
  };

  const setModeUi = (): void => {
    if (!listening && transcriptEl) {
      transcriptEl.textContent =
        "Tap mic, then say a slash command or click + New agent";
    }
  };

  const setListeningUi = (active: boolean): void => {
    listening = active;
    if (micBtn) {
      micBtn.classList.toggle("btn-mic-active", active);
      micBtn.setAttribute("aria-pressed", String(active));
    }
    if (micLabel) {
      micLabel.textContent = active ? "Listening… tap to stop" : "Tap to speak";
    }
    onListeningChange?.(active);
  };

  const stopSession = async (commit = true): Promise<void> => {
    const wasListening = listening;
    const finalPrompt = promptBuffer.trim();
    const finalIntent = intent;
    unsubTranscript?.();
    unsubTranscript = undefined;
    await browserMic?.stop();
    browserMic = undefined;
    stopGlassesMic?.();
    stopGlassesMic = undefined;
    await deepgram?.close();
    deepgram = undefined;
    setListeningUi(false);
    promptBuffer = "";
    if (
      wasListening &&
      commit &&
      finalPrompt.length > 0 &&
      (finalIntent.kind === "newAgent" || finalIntent.kind === "followup")
    ) {
      const verb = finalIntent.kind === "newAgent" ? "new" : "followup";
      onCommand({ verb, rest: finalPrompt, direct: true });
    }
    // Reset intent to default command mode for next manual session
    intent = { kind: "command" };
    setModeUi();
  };

  const startSession = async (): Promise<void> => {
    const apiKey = await getDeepgramApiKey();
    if (!apiKey) {
      setTranscript("Deepgram API key missing — sign in first");
      return;
    }

    deepgram = new DeepgramLive(apiKey);
    await deepgram.start();
    deepgram.keepAlive();

    const onPcm = (frame: Int16Array | Uint8Array): void => {
      if (frame instanceof Int16Array) {
        deepgram?.sendPcm(
          new Uint8Array(frame.buffer, frame.byteOffset, frame.byteLength)
        );
        return;
      }
      deepgram?.sendPcm(frame);
    };

    unsubTranscript = deepgram.on("transcript", (chunk) => {
      const liveTranscript =
        intent.kind === "newAgent" || intent.kind === "followup"
          ? (promptBuffer + (promptBuffer ? " " : "") + chunk.transcript).trim()
          : chunk.transcript;
      if (liveTranscript) {
        setTranscript(liveTranscript);
      }
      onTranscript?.(liveTranscript, chunk.speechFinal === true);
      if (!chunk.speechFinal) {
        return;
      }

      if (intent.kind === "newAgent" || intent.kind === "followup") {
        const piece = chunk.transcript.trim();
        if (piece.length === 0) {
          return;
        }
        promptBuffer = promptBuffer
          ? `${promptBuffer} ${piece}`
          : piece;
        return;
      }

      if (intent.kind === "dictate") {
        const appended = appendToFocusedField(chunk.transcript);
        if (!appended) {
          setTranscript(chunk.transcript);
        }
        return;
      }

      const parsed = parseTranscript(chunk.transcript);
      if (parsed.firstCommand) {
        const mapped = mapCommandToken(parsed.firstCommand);
        if (mapped) {
          onCommand(mapped);
        }
      }
    });

    if (glassesMicAvailable && openGlassesMic) {
      stopGlassesMic = await openGlassesMic((frame) => onPcm(frame));
    } else {
      browserMic = new BrowserMic();
      await browserMic.start(onPcm);
    }

    setListeningUi(true);
    setTranscript(introTranscriptText());
  };

  const introTranscriptText = (): string => {
    switch (intent.kind) {
      case "newAgent":
        return "Speak the prompt for the new agent…";
      case "followup":
        return "Speak the follow-up prompt…";
      case "dictate":
        return "Dictating…";
      default:
        return "Listening…";
    }
  };

  const onMicClick = (): void => {
    if (destroyed) {
      return;
    }
    if (listening) {
      void stopSession(true);
      return;
    }
    intent = { kind: "command" };
    promptBuffer = "";
    void startSession().catch((err: unknown) => {
      const message = err instanceof Error ? err.message : "Could not start microphone";
      setTranscript(message);
      void stopSession(false);
    });
  };

  micBtn?.addEventListener("click", onMicClick);
  setModeUi();

  return {
    destroy: () => {
      destroyed = true;
      micBtn?.removeEventListener("click", onMicClick);
      void stopSession(false);
      root.replaceChildren();
    },
    stop: (opts) => {
      if (listening) {
        void stopSession(opts?.commit !== false);
      }
    },
    isListening: () => listening,
    startForIntent: async (next: VoiceIntent) => {
      if (listening) {
        await stopSession(false);
      }
      intent = next;
      promptBuffer = "";
      try {
        await startSession();
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Could not start microphone";
        setTranscript(message);
        await stopSession(false);
      }
    },
    getIntent: () => intent
  };
}
