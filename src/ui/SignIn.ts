import { CursorClient } from "../cursor/client.js";
import {
  setCursorApiKey,
  setDeepgramApiKey
} from "../cursor/auth.js";
import type { KeyStore } from "../storage/storage.js";

const CURSOR_KEY_URL = "https://cursor.com/dashboard/integrations";
const DEEPGRAM_KEY_URL = "https://console.deepgram.com/project/_/api-keys";

export type SignInDeps = {
  root: HTMLElement;
  keyStore: KeyStore;
  onSignedIn: () => void;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function mountSignIn(deps: SignInDeps): () => void {
  const { root, onSignedIn } = deps;

  root.innerHTML = `
    <div class="screen sign-in">
      <header class="screen-header">
        <h1>evencursor</h1>
        <p class="muted">Paste your API keys once. Stored on-device via Even Hub bridge or localStorage.</p>
      </header>
      <form class="sign-in-form" novalidate>
        <label class="field">
          <span>Cursor API key</span>
          <input type="password" name="cursorKey" autocomplete="off" placeholder="cur_…" required />
          <a class="field-link" href="${CURSOR_KEY_URL}" target="_blank" rel="noopener noreferrer">Get key from Cursor dashboard</a>
        </label>
        <label class="field">
          <span>Deepgram API key</span>
          <input type="password" name="deepgramKey" autocomplete="off" placeholder="…" required />
          <a class="field-link" href="${DEEPGRAM_KEY_URL}" target="_blank" rel="noopener noreferrer">Get key from Deepgram console</a>
        </label>
        <p class="status" role="status" aria-live="polite"></p>
        <button type="submit" class="btn btn-primary">Validate &amp; save</button>
      </form>
    </div>
  `;

  const form = root.querySelector<HTMLFormElement>(".sign-in-form");
  const statusEl = root.querySelector<HTMLElement>(".status");
  const submitBtn = root.querySelector<HTMLButtonElement>(".btn-primary");

  if (!form || !statusEl || !submitBtn) {
    return () => {
      root.replaceChildren();
    };
  }

  const setStatus = (message: string, kind: "info" | "error" | "success" = "info"): void => {
    statusEl.className = `status status-${kind}`;
    statusEl.innerHTML = escapeHtml(message);
  };

  const onSubmit = async (event: SubmitEvent): Promise<void> => {
    event.preventDefault();
    const cursorInput = form.querySelector<HTMLInputElement>('input[name="cursorKey"]');
    const deepgramInput = form.querySelector<HTMLInputElement>('input[name="deepgramKey"]');
    const cursorKey = cursorInput?.value.trim() ?? "";
    const deepgramKey = deepgramInput?.value.trim() ?? "";

    if (!cursorKey || !deepgramKey) {
      setStatus("Both API keys are required.", "error");
      return;
    }

    submitBtn.disabled = true;
    setStatus("Validating Cursor API key…");

    try {
      const client = new CursorClient(cursorKey);
      const me = await client.me();
      await setCursorApiKey(cursorKey);
      await setDeepgramApiKey(deepgramKey);
      setStatus(`Signed in as ${me.userEmail || me.apiKeyName}`, "success");
      window.dispatchEvent(new CustomEvent("signedIn"));
      onSignedIn();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not validate Cursor API key";
      setStatus(message, "error");
    } finally {
      submitBtn.disabled = false;
    }
  };

  const onFormSubmit = (e: SubmitEvent): void => {
    void onSubmit(e);
  };

  form.addEventListener("submit", onFormSubmit);

  return () => {
    form.removeEventListener("submit", onFormSubmit);
    root.replaceChildren();
  };
}
