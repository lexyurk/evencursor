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
  | { verb: "signout" };

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
    default:
      return null;
  }
}

export function mountVoiceBar(deps: VoiceBarDeps): () => void {
  const { root, onCommand, glassesMicAvailable, openGlassesMic } = deps;

  root.innerHTML = `
    <section class="voice-bar">
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

  let listening = false;
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
    setTranscript("Tap mic and say a slash command");
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
      if (chunk.speechFinal) {
        const parsed = parseTranscript(chunk.transcript);
        if (parsed.firstCommand) {
          const mapped = mapCommandToken(parsed.firstCommand);
          if (mapped) {
            onCommand(mapped);
          }
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
    setTranscript("Listening…");
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

  micBtn?.addEventListener("click", onMicClick);

  return () => {
    destroyed = true;
    micBtn?.removeEventListener("click", onMicClick);
    void stopSession();
    root.replaceChildren();
  };
}
