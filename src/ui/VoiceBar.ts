import { getDeepgramApiKey } from "../cursor/auth.js";
import { parseTranscript } from "../voice/commands.js";
import { DeepgramLive } from "../voice/deepgram.js";
import { BrowserMic } from "../voice/mic.js";
import type { CommandToken } from "../voice/types.js";

export type VoiceCommand =
  | { verb: "new"; rest: string }
  | { verb: "cancel" }
  | { verb: "followup"; rest: string }
  | { verb: "refresh" }
  | { verb: "select"; index: number }
  | { verb: "open"; repo: string }
  | { verb: "signin" }
  | { verb: "signout" }
  | { verb: "archive" }
  | { verb: "unarchive" }
  | { verb: "delete" };

export type VoiceBarMode = "command" | "dictate";

export type VoiceBarDeps = {
  root: HTMLElement;
  onCommand: (command: VoiceCommand) => void;
  glassesMicAvailable?: boolean;
  openGlassesMic?: (onPcm: (frame: Uint8Array) => void) => Promise<() => void>;
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

export function mountVoiceBar(deps: VoiceBarDeps): () => void {
  const { root, onCommand, glassesMicAvailable, openGlassesMic } = deps;

  root.innerHTML = `
    <section class="voice-bar">
      <div class="voice-mode-toggle" role="group" aria-label="Voice input mode">
        <button type="button" class="btn btn-ghost voice-mode-btn voice-mode-command" data-mode="command" aria-pressed="true">Command</button>
        <button type="button" class="btn btn-ghost voice-mode-btn voice-mode-dictate" data-mode="dictate" aria-pressed="false">Dictate</button>
      </div>
      <button type="button" class="btn-mic" aria-pressed="false" aria-label="Toggle microphone">
        <span class="btn-mic-icon" aria-hidden="true">🎤</span>
        <span class="btn-mic-label">Tap to speak</span>
      </button>
      <p class="voice-transcript muted" aria-live="polite">Tap mic and say a slash command</p>
    </section>
  `;

  const micBtn = root.querySelector<HTMLButtonElement>(".btn-mic");
  const transcriptEl = root.querySelector<HTMLElement>(".voice-transcript");
  const micLabel = root.querySelector<HTMLElement>(".btn-mic-label");
  const modeButtons = root.querySelectorAll<HTMLButtonElement>(".voice-mode-btn");

  let listening = false;
  let mode: VoiceBarMode = "command";
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
    modeButtons.forEach((button) => {
      const active = button.dataset.mode === mode;
      button.setAttribute("aria-pressed", String(active));
      button.classList.toggle("voice-mode-active", active);
    });
    if (!listening && transcriptEl) {
      transcriptEl.textContent =
        mode === "command"
          ? "Tap mic and say a slash command"
          : "Dictate mode — focus a text field, then speak";
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
  };

  const stopSession = async (): Promise<void> => {
    unsubTranscript?.();
    unsubTranscript = undefined;
    await browserMic?.stop();
    browserMic = undefined;
    stopGlassesMic?.();
    stopGlassesMic = undefined;
    await deepgram?.close();
    deepgram = undefined;
    setListeningUi(false);
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
      if (chunk.transcript) {
        setTranscript(chunk.transcript);
      }
      if (!chunk.speechFinal) {
        return;
      }

      if (mode === "dictate") {
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
    setTranscript(mode === "command" ? "Listening…" : "Dictating…");
  };

  const onMicClick = (): void => {
    if (destroyed) {
      return;
    }
    if (listening) {
      void stopSession();
      return;
    }
    void startSession().catch((err: unknown) => {
      const message = err instanceof Error ? err.message : "Could not start microphone";
      setTranscript(message);
      void stopSession();
    });
  };

  modeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const next = button.dataset.mode;
      if (next === "command" || next === "dictate") {
        mode = next;
        setModeUi();
      }
    });
  });

  micBtn?.addEventListener("click", onMicClick);
  setModeUi();

  return () => {
    destroyed = true;
    micBtn?.removeEventListener("click", onMicClick);
    void stopSession();
    root.replaceChildren();
  };
}
