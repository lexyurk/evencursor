import { getDeepgramApiKey } from "../cursor/auth.js";
import { CursorClient } from "../cursor/client.js";
import {
  buildModelPickerOptions,
  defaultModelPickerValue,
  parseModelChoice
} from "../cursor/models.js";
import type { KeyStore } from "../storage/storage.js";
import { DictationSession } from "../voice/dictation.js";

const LAST_MODEL_KEY = "agent.lastModel";

export type NewAgentDialogDeps = {
  client: CursorClient;
  keyStore: KeyStore;
  portal: HTMLElement;
  openMic?: (
    sendPcm: (frame: Int16Array | Uint8Array) => void
  ) => Promise<() => void>;
  initial?: {
    prompt?: string;
    repositoryUrl?: string;
    name?: string;
  };
  onCreated: () => void;
  onClose: () => void;
};

function normalizeRepositoryInput(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  if (/^https:\/\/github\.com\/[^/]+\/[^/]+\/?$/i.test(trimmed)) {
    return trimmed.replace(/\/$/, "");
  }
  if (/^[^/\s]+\/[^/\s]+$/.test(trimmed)) {
    return `https://github.com/${trimmed}`;
  }
  return undefined;
}

function isValidRepositoryInput(value: string): boolean {
  if (!value.trim()) {
    return true;
  }
  return normalizeRepositoryInput(value) !== undefined;
}

export function mountNewAgentDialog(deps: NewAgentDialogDeps): () => void {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="new-agent-title">
      <header class="modal-header">
        <h2 id="new-agent-title">New agent</h2>
        <button type="button" class="btn btn-ghost btn-modal-close" aria-label="Close">✕</button>
      </header>
      <form class="modal-form">
        <label class="field field-with-mic">
          <span class="field-label-row">
            <span>Prompt</span>
            <button type="button" class="btn-mic-inline" aria-label="Dictate prompt">🎤</button>
          </span>
          <textarea name="prompt" rows="4" required placeholder="Describe the task…"></textarea>
          <span class="field-hint char-counter muted">0 characters</span>
        </label>
        <label class="field">
          <span>Repository</span>
          <input name="repositoryUrl" type="text" placeholder="owner/repo or https://github.com/owner/repo" />
        </label>
        <label class="field">
          <span>Name</span>
          <input name="name" type="text" placeholder="Optional display name" />
        </label>
        <label class="field">
          <span>Model</span>
          <select name="model" disabled>
            <option value="">Loading models…</option>
          </select>
        </label>
        <label class="field">
          <span>Mode</span>
          <select name="mode">
            <option value="agent">Agent</option>
            <option value="plan">Plan</option>
          </select>
        </label>
        <p class="modal-status muted" role="status"></p>
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost btn-cancel">Cancel</button>
          <button type="submit" class="btn btn-primary">Create agent</button>
        </div>
      </form>
    </div>
  `;

  deps.portal.appendChild(overlay);

  const dialog = overlay.querySelector<HTMLElement>(".modal-dialog");
  const form = overlay.querySelector<HTMLFormElement>(".modal-form");
  const statusEl = overlay.querySelector<HTMLElement>(".modal-status");
  const promptEl = overlay.querySelector<HTMLTextAreaElement>('textarea[name="prompt"]');
  const repoEl = overlay.querySelector<HTMLInputElement>('input[name="repositoryUrl"]');
  const nameEl = overlay.querySelector<HTMLInputElement>('input[name="name"]');
  const modelEl = overlay.querySelector<HTMLSelectElement>('select[name="model"]');
  const modeEl = overlay.querySelector<HTMLSelectElement>('select[name="mode"]');
  const counterEl = overlay.querySelector<HTMLElement>(".char-counter");
  const micBtn = overlay.querySelector<HTMLButtonElement>(".btn-mic-inline");

  let dictation: DictationSession | undefined;
  let destroyed = false;

  const close = (): void => {
    if (destroyed) {
      return;
    }
    destroyed = true;
    dictation?.stop();
    overlay.remove();
    deps.onClose();
  };

  const updateCounter = (): void => {
    if (counterEl && promptEl) {
      counterEl.textContent = `${promptEl.value.length} characters`;
    }
  };

  const loadModels = async (): Promise<void> => {
    if (!modelEl) {
      return;
    }
    try {
      const catalog = await deps.client.listModels();
      const options = buildModelPickerOptions(catalog);
      const saved = await deps.keyStore.getKey(LAST_MODEL_KEY);
      const defaultValue = saved && options.some((o) => o.value === saved)
        ? saved
        : defaultModelPickerValue(options);

      modelEl.replaceChildren();
      for (const opt of options) {
        const option = document.createElement("option");
        option.value = opt.value;
        option.textContent = opt.label;
        modelEl.appendChild(option);
      }
      modelEl.disabled = false;
      if (defaultValue) {
        modelEl.value = defaultValue;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load models";
      modelEl.innerHTML = `<option value="">${message}</option>`;
    }
  };

  const startDictation = async (): Promise<void> => {
    if (!promptEl) {
      return;
    }
    const apiKey = await getDeepgramApiKey();
    if (!apiKey) {
      if (statusEl) {
        statusEl.textContent = "Deepgram API key missing";
      }
      return;
    }

    dictation?.stop();
    dictation = new DictationSession({
      apiKey,
      target: promptEl,
      openMic: deps.openMic
    });
    await dictation.start();
  };

  if (deps.initial?.prompt && promptEl) {
    promptEl.value = deps.initial.prompt;
  }
  if (deps.initial?.repositoryUrl && repoEl) {
    repoEl.value = deps.initial.repositoryUrl;
  }
  if (deps.initial?.name && nameEl) {
    nameEl.value = deps.initial.name;
  }

  updateCounter();
  void loadModels();

  promptEl?.addEventListener("input", updateCounter);

  nameEl?.addEventListener("blur", () => {
    if (nameEl && !nameEl.value.trim() && promptEl) {
      nameEl.value = promptEl.value.trim().slice(0, 48);
    }
  });

  micBtn?.addEventListener("click", () => {
    void startDictation();
  });

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) {
      close();
    }
  });

  overlay.querySelector(".btn-modal-close")?.addEventListener("click", close);
  overlay.querySelector(".btn-cancel")?.addEventListener("click", close);

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") {
      close();
    }
  };
  document.addEventListener("keydown", onKeyDown);

  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    void (async () => {
      if (!promptEl || !form) {
        return;
      }

      const prompt = promptEl.value.trim();
      if (prompt.length < 1) {
        if (statusEl) {
          statusEl.textContent = "Prompt is required";
        }
        return;
      }

      const repoRaw = repoEl?.value ?? "";
      if (!isValidRepositoryInput(repoRaw)) {
        if (statusEl) {
          statusEl.textContent = "Repository must be owner/repo or a GitHub URL";
        }
        return;
      }

      const repositoryUrl = normalizeRepositoryInput(repoRaw);
      const name = nameEl?.value.trim() || prompt.slice(0, 48);
      const mode = (modeEl?.value === "plan" ? "plan" : "agent") as "agent" | "plan";

      let model: { id: string; params?: { id: string; value: string }[] } | undefined;
      if (modelEl?.value) {
        const parsed = parseModelChoice(modelEl.value);
        if (parsed) {
          model = {
            id: parsed.modelId,
            params: parsed.params.length > 0 ? parsed.params : undefined
          };
          await deps.keyStore.setKey(LAST_MODEL_KEY, modelEl.value);
        }
      }

      const submitBtn = form.querySelector<HTMLButtonElement>('button[type="submit"]');
      if (submitBtn) {
        submitBtn.disabled = true;
      }
      if (statusEl) {
        statusEl.textContent = "Creating…";
      }

      try {
        await deps.client.createAgent({
          prompt,
          repositoryUrl,
          name,
          mode,
          model
        });
        deps.onCreated();
        close();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Create failed";
        if (statusEl) {
          statusEl.textContent = message;
        }
        if (submitBtn) {
          submitBtn.disabled = false;
        }
      }
    })();
  });

  dialog?.focus();

  return () => {
    document.removeEventListener("keydown", onKeyDown);
    dictation?.stop();
    if (!destroyed) {
      overlay.remove();
      destroyed = true;
    }
  };
}
