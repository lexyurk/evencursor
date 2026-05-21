import { CursorClient } from "../cursor/client.js";
import type { Agent, Run, RunStatus, RunStreamEvent } from "../cursor/types.js";
import type { GlassesAdapter } from "../glasses/adapter.js";
import { escapeHtml, statusBadgeClass } from "./utils.js";

export type AgentDetailDeps = {
  root: HTMLElement;
  agent: Agent;
  client: CursorClient;
  glasses: GlassesAdapter;
  onBack: () => void;
  onAgentUpdated: (agent: Agent) => void;
};

function isTerminalStatus(status: RunStatus): boolean {
  return (
    status === "FINISHED" ||
    status === "ERRORED" ||
    status === "CANCELLED" ||
    status === "EXPIRED"
  );
}

export function mountAgentDetail(deps: AgentDetailDeps): () => void {
  const { root, client, glasses, onBack, onAgentUpdated } = deps;
  let agent = deps.agent;
  let latestRun: Run | undefined = agent.latestRun;
  let assistantLog = "";
  let streamAbort: AbortController | undefined;
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

  const render = (): void => {
    const runStatus = latestRun?.status ?? "—";
    const canCancel = latestRun !== undefined && !isTerminalStatus(latestRun.status);
    const canFollowUp = !latestRun || isTerminalStatus(latestRun.status);

    root.innerHTML = `
      <section class="agent-detail">
        <header class="agent-detail-header">
          <button type="button" class="btn btn-ghost btn-back" aria-label="Back to agents">← Back</button>
          <h2>${escapeHtml(agent.name || "Agent")}</h2>
        </header>
        <dl class="agent-meta">
          <div><dt>Status</dt><dd><span class="badge ${statusBadgeClass(agent.status)}">${escapeHtml(agent.status)}</span></dd></div>
          <div><dt>Repository</dt><dd>${escapeHtml(agent.repositoryUrl ?? "—")}</dd></div>
          <div><dt>Latest run</dt><dd><span class="badge ${statusBadgeClass(String(runStatus))}">${escapeHtml(String(runStatus))}</span></dd></div>
        </dl>
        <form class="follow-up-form">
          <label class="field">
            <span>Follow-up prompt</span>
            <textarea name="prompt" rows="3" placeholder="Add a follow-up…" ${canFollowUp ? "" : "disabled"}></textarea>
          </label>
          <div class="agent-detail-actions">
            <button type="submit" class="btn btn-primary" ${canFollowUp ? "" : "disabled"}>Send follow-up</button>
            <button type="button" class="btn btn-danger btn-cancel" ${canCancel ? "" : "disabled"}>Cancel run</button>
          </div>
        </form>
        <pre class="assistant-log" aria-live="polite"></pre>
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

    backBtn?.addEventListener("click", () => {
      onBack();
    });

    cancelBtn?.addEventListener("click", () => {
      void onCancel();
    });

    form?.addEventListener("submit", (event) => {
      event.preventDefault();
      void onFollowUp(form);
    });
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

  const startStream = async (run: Run): Promise<void> => {
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
      const message = err instanceof Error ? err.message : "Stream failed";
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
      latestRun = run;
      agent = { ...agent, latestRun };
      onAgentUpdated(agent);
      textarea.value = "";
      assistantLog = "";
      render();
      renderHud();
      void startStream(run);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Follow-up failed";
      appendLog(`[follow-up] ${message}`);
    }
  };

  void (async () => {
    await resolveLatestRun();
    if (destroyed) {
      return;
    }
    render();
    renderHud();
    if (latestRun && !isTerminalStatus(latestRun.status)) {
      void startStream(latestRun);
    }
  })();

  return () => {
    destroyed = true;
    stopStream();
    root.replaceChildren();
  };
}
