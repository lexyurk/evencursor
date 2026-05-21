import { DeepgramLive } from "./deepgram.js";
import { BrowserMic } from "./mic.js";
import type { DeepgramTranscript } from "./types.js";

export type DictationSessionDeps = {
  apiKey: string;
  target: HTMLTextAreaElement | HTMLInputElement;
  onCommit?: (text: string) => void;
  openMic?: (
    sendPcm: (frame: Int16Array | Uint8Array) => void
  ) => Promise<() => void>;
  createDeepgram?: (apiKey: string) => DeepgramLive;
};

export class DictationSession {
  private deepgram: DeepgramLive | undefined;
  private stopMic: (() => void) | undefined;
  private unsub: (() => void) | undefined;
  private previewEl: HTMLElement | undefined;
  private interimText = "";
  private readonly createDeepgram: (apiKey: string) => DeepgramLive;

  constructor(private readonly deps: DictationSessionDeps) {
    this.createDeepgram = deps.createDeepgram ?? ((key) => new DeepgramLive(key));
  }

  async start(): Promise<void> {
    this.deepgram = this.createDeepgram(this.deps.apiKey);
    await this.deepgram.start();
    this.deepgram.keepAlive();

    this.unsub = this.deepgram.on("transcript", (chunk) => {
      this.handleTranscript(chunk);
    });

    const sendPcm = (frame: Int16Array | Uint8Array): void => {
      if (frame instanceof Int16Array) {
        this.deepgram?.sendPcm(
          new Uint8Array(frame.buffer, frame.byteOffset, frame.byteLength)
        );
        return;
      }
      this.deepgram?.sendPcm(frame);
    };

    if (this.deps.openMic) {
      this.stopMic = await this.deps.openMic(sendPcm);
    } else {
      const browserMic = new BrowserMic();
      await browserMic.start(sendPcm);
      this.stopMic = () => {
        void browserMic.stop();
      };
    }

    this.ensurePreview();
  }

  stop(): void {
    this.unsub?.();
    this.unsub = undefined;
    this.stopMic?.();
    this.stopMic = undefined;
    void this.deepgram?.close();
    this.deepgram = undefined;
    this.removePreview();
  }

  private handleTranscript(chunk: DeepgramTranscript): void {
    if (chunk.speechFinal) {
      this.appendFinal(chunk.transcript);
      this.interimText = "";
      this.updatePreview("");
      return;
    }

    if (!chunk.isFinal && chunk.transcript) {
      this.interimText = chunk.transcript;
      this.updatePreview(this.interimText);
    }
  }

  private appendFinal(text: string): void {
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }

    const target = this.deps.target;
    const prefix =
      target.value.length > 0 && !target.value.endsWith(" ") ? " " : "";
    target.value = `${target.value}${prefix}${trimmed}`;
    target.dispatchEvent(new Event("input", { bubbles: true }));
    this.deps.onCommit?.(trimmed);
  }

  private ensurePreview(): void {
    if (this.previewEl) {
      return;
    }

    const box = document.createElement("div");
    box.className = "dictation-preview";
    box.innerHTML = `
      <p class="dictation-preview-text muted"></p>
      <div class="dictation-preview-actions">
        <button type="button" class="btn btn-ghost btn-dictation-insert">✓ Insert</button>
        <button type="button" class="btn btn-ghost btn-dictation-cancel">✗ Cancel</button>
      </div>
    `;

    const rect = this.deps.target.getBoundingClientRect();
    box.style.position = "fixed";
    box.style.left = `${rect.left}px`;
    box.style.top = `${Math.max(8, rect.top - 72)}px`;
    box.style.width = `${rect.width}px`;
    box.style.zIndex = "1000";

    box.querySelector(".btn-dictation-insert")?.addEventListener("click", () => {
      if (this.interimText.trim()) {
        this.appendFinal(this.interimText);
        this.interimText = "";
      }
      this.updatePreview("");
    });

    box.querySelector(".btn-dictation-cancel")?.addEventListener("click", () => {
      this.interimText = "";
      this.updatePreview("");
    });

    document.body.appendChild(box);
    this.previewEl = box;
  }

  private updatePreview(text: string): void {
    this.ensurePreview();
    const textEl = this.previewEl?.querySelector<HTMLElement>(
      ".dictation-preview-text"
    );
    if (!textEl) {
      return;
    }
    if (!text.trim()) {
      textEl.textContent = "";
      textEl.style.fontStyle = "";
      return;
    }
    textEl.textContent = text;
    textEl.style.fontStyle = "italic";
  }

  private removePreview(): void {
    this.previewEl?.remove();
    this.previewEl = undefined;
    this.interimText = "";
  }
}
