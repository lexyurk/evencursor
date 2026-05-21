import { getDeepgramApiKey } from "../cursor/auth.js";
import { CursorClient, StreamExpiredError } from "../cursor/client.js";
import type { Agent, Run, RunStatus, RunStreamEvent } from "../cursor/types.js";
import type { GlassesAdapter } from "../glasses/adapter.js";
import { DictationSession } from "../voice/dictation.js";

export type AgentDetailDeps = {
  root: HTMLElement;
  agent: Agent;
  client: CursorClient;
  glasses: GlassesAdapter;
  onBack: () => void;
  onAgentUpdated: (agent: Agent) => void;
  onDeleted?: () => void;
  openMic?: (
    sendPcm: (frame: Int16Array | Uint8Array) => void
  ) => Promise<() => void>;
};

export type AgentDetailHandle = {
  destroy: () => void;
  applyVoiceFollowUp: (prompt: string) => void;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isTerminalStatus(status: RunStatus): boolean {
  return (
    status === "FINISHED" ||
    status === "ERRORED" ||
    status === "CANCELLED" ||
    status === "EXPIRED"
  );
}

function statusBadgeClass(status: string): string {
  const upper = status.toUpperCase();
  if (upper.includes("RUN") || upper === "CREATING") {
    return "badge-running";
  }
  if (upper.includes("FINISH") || upper.includes("DONE")) {
    return "badge-finished";
  }
  if (upper.includes("ERROR") || upper.includes("FAIL")) {
    return "badge-errored";
  }
  if (upper.includes("CANCEL")) {
    return "badge-cancelled";
  }
  return "badge-idle";
}

function formatTimeSince(iso: string): string {
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) {
    return "unknown";
  }
  const seconds = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (seconds < 60) {
    return `${seconds}s ago`;
  }
  if (seconds < 3600) {
    return `${Math.floor(seconds / 60)}m ago`;
  }
  if (seconds < 86_400) {
    return `${Math.floor(seconds / 3600)}h ago`;
  }
  return `${Math.floor(seconds / 86_400)}d ago`;
}

export function mountAgentDetail(deps: AgentDetailDeps): AgentDetailHandle {
  const { root, client, glasses, onBack, onAgentUpdated, onDeleted, openMic } =
    deps;
  let agent = deps.agent;
  let latestRun: Run | undefined = agent.latestRun;
  let runHistory: Run[] = [];
  let assistantLog = "";
  let streamAbort: AbortController | undefined;
  let dictation: DictationSession | undefined;
  let destroyed = false;

  const renderHud = (): void => {
    const status = latestRun?.status ?? agent.status;
    const statusLine = latestRun
      ? `Run ${latestRun.id.slice(0, 8)}… · ${status}`
      : status;
    void glasses.showAgentDetail({
      title: agent.name || "Agent",
      statusLine,
      lastDelta: assistantLog.split("\n").pop() ?? "",
      footer: "Swipe up: back · Press: follow up"
    });
  };

  const syncHudDelta = (): void => {
    const lastLine = assistantLog.split("\n").filter(Boolean).pop() ?? "";
    void glasses.updateDetailDelta(lastLine);
  };

  const getFollowUpTextarea = (): HTMLTextAreaElement | null =>
    root.querySelector<HTMLTextAreaElement>('textarea[name="prompt"]');

  const applyVoiceFollowUp = (prompt: string): void => {
    const textarea = getFollowUpTextarea();
    if (!textarea) {
      return;
    }
    textarea.value = prompt.trim();
    textarea.disabled = false;
    textarea.focus();
    textarea.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const render = (): void => {
    const runStatus = latestRun?.status ?? "—";
    const canCancel = latestRun !== undefined && !isTerminalStatus(latestRun.status);
    const canFollowUp = !latestRun || isTerminalStatus(latestRun.status);
    const archiveLabel = agent.archived ? "Unarchive" : "Archive";

    root.innerHTML = `
      <section class="agent-detail">
        <header class="agent-detail-header">
          <button type="button" class="btn btn-ghost btn-back" aria-label="Back to agents">← Back</button>
          <h2>${escapeHtml(agent.name || "Agent")}</h2>
          <button type="button" class="btn btn-ghost btn-archive">${archiveLabel}</button>
        </header>
        <dl class="agent-meta">
          <div><dt>Status</dt><dd><span class="badge ${statusBadgeClass(agent.status)}">${escapeHtml(agent.status)}</span>${agent.archived ? ' <span class="badge badge-archived">Archived</span>' : ""}</dd></div>
          <div><dt>Repository</dt><dd>${escapeHtml(agent.repositoryUrl ?? "—")}</dd></div>
          <div><dt>Latest run</dt><dd><span class="badge ${statusBadgeClass(String(runStatus))}">${escapeHtml(String(runStatus))}</span></dd></div>
        </dl>
        <section class="run-history">
          <h3>Run history</h3>
          <ul class="run-history-list">
            ${
              runHistory.length === 0
                ? '<li class="muted">No runs yet</li>'
                : runHistory
                    .map(
                      (run) => `
              <li>
                <button type="button" class="run-history-row" data-run-id="${escapeHtml(run.id)}">
                  <span class="badge ${statusBadgeClass(run.status)}">${escapeHtml(run.status)}</span>
                  <span class="run-id">${escapeHtml(run.id.slice(0, 10))}…</span>
                  <span class="muted">${escapeHtml(formatTimeSince(run.createdAt))}</span>
                </button>
              </li>`
                    )
                    .join("")
            }
          </ul>
        </section>
        <form class="follow-up-form">
          <label class="field field-with-mic">
            <span class="field-label-row">
              <span>Follow-up prompt</span>
              <button type="button" class="btn-mic-inline btn-followup-mic" aria-label="Dictate follow-up">🎤</button>
            </span>
            <textarea name="prompt" rows="3" placeholder="Add a follow-up…" ${canFollowUp ? "" : "disabled"}></textarea>
          </label>
          <div class="agent-detail-actions">
            <button type="submit" class="btn btn-primary" ${canFollowUp ? "" : "disabled"}>Send follow-up</button>
            <button type="button" class="btn btn-danger btn-cancel" ${canCancel ? "" : "disabled"}>Cancel run</button>
          </div>
        </form>
        <pre class="assistant-log" aria-live="polite"></pre>
        <button type="button" class="btn btn-danger btn-delete-agent">Delete agent</button>
      </section>
    `;

    const logEl = root.querySelector<HTMLElement>(".assistant-log");
    if (logEl) {
      logEl.textContent = assistantLog;
      logEl.scrollTop = logEl.scrollHeight;
    }

    const form = root.querySelector<HTMLFormElement>(".follow-up-form");
    const backBtn = root.querySelector<HTMLButtonElement>(".btn-back");
    const cancelBtn = root.querySelector<HTMLButtonElement>(".btn-cancel");
    const archiveBtn = root.querySelector<HTMLButtonElement>(".btn-archive");
    const deleteBtn = root.querySelector<HTMLButtonElement>(".btn-delete-agent");
    const micBtn = root.querySelector<HTMLButtonElement>(".btn-followup-mic");

    backBtn?.addEventListener("click", () => {
      onBack();
    });

    archiveBtn?.addEventListener("click", () => {
      void onArchiveToggle();
    });

    deleteBtn?.addEventListener("click", () => {
      void onDelete();
    });

    cancelBtn?.addEventListener("click", () => {
      void onCancel();
    });

    micBtn?.addEventListener("click", () => {
      void startDictation();
    });

    form?.addEventListener("submit", (event) => {
      event.preventDefault();
      void onFollowUp(form);
    });

    root.querySelectorAll<HTMLButtonElement>(".run-history-row").forEach((row) => {
      row.addEventListener("click", () => {
        const runId = row.dataset.runId;
        const run = runHistory.find((item) => item.id === runId);
        if (run) {
          void attachRunStream(run, true);
        }
      });
    });
  };

  const startDictation = async (): Promise<void> => {
    const textarea = getFollowUpTextarea();
    if (!textarea) {
      return;
    }
    const apiKey = await getDeepgramApiKey();
    if (!apiKey) {
      appendLog("[dictation] Deepgram API key missing");
      return;
    }

    dictation?.stop();
    dictation = new DictationSession({
      apiKey,
      target: textarea,
      openMic
    });
    await dictation.start();
  };

  const appendLog = (line: string): void => {
    assistantLog = assistantLog.length > 0 ? `${assistantLog}\n${line}` : line;
    const logEl = root.querySelector<HTMLElement>(".assistant-log");
    if (logEl) {
      logEl.textContent = assistantLog;
      logEl.scrollTop = logEl.scrollHeight;
    }
    syncHudDelta();
  };

  const handleStreamEvent = (event: RunStreamEvent): void => {
    if (destroyed) {
      return;
    }

    switch (event.type) {
      case "status":
        if (latestRun) {
          latestRun = { ...latestRun, status: event.status };
          agent = { ...agent, latestRun };
          onAgentUpdated(agent);
          render();
          renderHud();
        }
        if (isTerminalStatus(event.status)) {
          stopStream();
        }
        break;
      case "assistant":
        if (event.delta) {
          appendLog(event.delta);
        }
        break;
      case "thinking":
        if (event.delta) {
          appendLog(`[thinking] ${event.delta}`);
        }
        break;
      case "tool_call":
        appendLog(`[tool] ${event.name}`);
        break;
      case "result":
        if (event.summary) {
          appendLog(`[result] ${event.summary}`);
        }
        break;
      case "error":
        appendLog(`[error] ${event.message}`);
        break;
      case "done":
        stopStream();
        break;
      default:
        break;
    }
  };

  const stopStream = (): void => {
    streamAbort?.abort();
    streamAbort = undefined;
  };

  const attachRunStream = async (run: Run, readOnly = false): Promise<void> => {
    latestRun = run;
    agent = { ...agent, latestRun };
    onAgentUpdated(agent);
    if (!readOnly) {
      assistantLog = "";
    } else {
      assistantLog = `[run ${run.id.slice(0, 8)}…]\n`;
    }
    render();
    renderHud();
    stopStream();

    const abort = new AbortController();
    streamAbort = abort;

    try {
      for await (const event of client.streamRun(agent.id, run.id, {
        signal: abort.signal
      })) {
        if (destroyed || abort.signal.aborted) {
          break;
        }
        handleStreamEvent(event);
      }
    } catch (err) {
      if (destroyed || abort.signal.aborted) {
        return;
      }
      if (err instanceof StreamExpiredError) {
        if (readOnly) {
          return;
        }
      }
      const message = err instanceof Error ? err.message : "Stream failed";
      if (readOnly && message.includes("410")) {
        return;
      }
      appendLog(`[stream] ${message}`);
    }
  };

  const resolveLatestRun = async (): Promise<void> => {
    if (latestRun) {
      return;
    }
    const runs = await client.listRuns(agent.id, { limit: 1 });
    latestRun = runs.items[0];
    if (latestRun) {
      agent = { ...agent, latestRun };
      onAgentUpdated(agent);
    }
  };

  const loadRunHistory = async (): Promise<void> => {
    const runs = await client.listRuns(agent.id, { limit: 10 });
    runHistory = runs.items;
    render();
  };

  const onArchiveToggle = async (): Promise<void> => {
    try {
      if (agent.archived) {
        await client.unarchiveAgent(agent.id);
        agent = { ...agent, archived: false };
      } else {
        await client.archiveAgent(agent.id);
        agent = { ...agent, archived: true };
      }
      onAgentUpdated(agent);
      render();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Archive failed";
      appendLog(`[archive] ${message}`);
    }
  };

  const onDelete = async (): Promise<void> => {
    const label = agent.name || agent.id;
    if (!globalThis.confirm(`Delete agent “${label}”? This cannot be undone.`)) {
      return;
    }
    try {
      await client.deleteAgent(agent.id);
      onDeleted?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Delete failed";
      appendLog(`[delete] ${message}`);
    }
  };

  const onCancel = async (): Promise<void> => {
    if (!latestRun || isTerminalStatus(latestRun.status)) {
      return;
    }
    try {
      await client.cancelRun(agent.id, latestRun.id);
      latestRun = { ...latestRun, status: "CANCELLED" };
      agent = { ...agent, latestRun };
      onAgentUpdated(agent);
      render();
      renderHud();
      stopStream();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Cancel failed";
      appendLog(`[cancel] ${message}`);
    }
  };

  const onFollowUp = async (form: HTMLFormElement): Promise<void> => {
    const textarea = form.querySelector<HTMLTextAreaElement>('textarea[name="prompt"]');
    if (!textarea) {
      return;
    }

    const prompt = textarea.value.trim();
    if (!prompt) {
      return;
    }

    try {
      const { run } = await client.createRun(agent.id, { prompt });
      textarea.value = "";
      void attachRunStream(run);
      void loadRunHistory();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Follow-up failed";
      appendLog(`[follow-up] ${message}`);
    }
  };

  void (async () => {
    await resolveLatestRun();
    await loadRunHistory();
    render();
    renderHud();
    if (latestRun && !isTerminalStatus(latestRun.status)) {
      void attachRunStream(latestRun);
    }
  })();

  return {
    destroy: () => {
      destroyed = true;
      dictation?.stop();
      stopStream();
      root.replaceChildren();
    },
    applyVoiceFollowUp
  };
}
