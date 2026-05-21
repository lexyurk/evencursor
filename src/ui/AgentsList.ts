import { CursorClient } from "../cursor/client.js";
import type { Agent } from "../cursor/types.js";
import { escapeHtml, statusBadgeClass } from "./utils.js";

const POLL_MS = 10_000;

export type AgentsListDeps = {
  root: HTMLElement;
  client: CursorClient;
  selectedId: string | null;
  onSelect: (agent: Agent) => void;
  onAgentsLoaded: (agents: Agent[]) => void;
};

export type AgentsListHandle = {
  refresh: () => void;
  getAgents: () => Agent[];
  destroy: () => void;
};

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

export function mountAgentsList(deps: AgentsListDeps): AgentsListHandle {
  const { root, client, selectedId, onSelect, onAgentsLoaded } = deps;

  root.innerHTML = `
    <section class="agents-list">
      <div class="agents-list-header">
        <h2>Agents</h2>
        <button type="button" class="btn btn-ghost btn-refresh" aria-label="Refresh agents">Refresh</button>
      </div>
      <p class="agents-list-status muted" role="status">Loading…</p>
      <ul class="agents-list-items" role="listbox" aria-label="Cloud agents"></ul>
    </section>
  `;

  const statusEl = root.querySelector<HTMLElement>(".agents-list-status");
  const listEl = root.querySelector<HTMLUListElement>(".agents-list-items");
  const refreshBtn = root.querySelector<HTMLButtonElement>(".btn-refresh");

  let agents: Agent[] = [];
  let loading = false;
  let pendingRefresh = false;
  let destroyed = false;
  let currentSelectedId = selectedId;

  const render = (): void => {
    if (!listEl || !statusEl) {
      return;
    }

    if (agents.length === 0) {
      listEl.innerHTML = "";
      statusEl.textContent = loading ? "Loading agents…" : "No agents yet. Try /new from the mic.";
      return;
    }

    statusEl.textContent = `${agents.length} agent${agents.length === 1 ? "" : "s"}`;
    listEl.innerHTML = agents
      .map((agent) => {
        const selected = agent.id === currentSelectedId;
        const runStatus = agent.latestRun?.status ?? agent.status;
        return `
          <li>
            <button
              type="button"
              class="agent-row${selected ? " agent-row-selected" : ""}"
              data-agent-id="${escapeHtml(agent.id)}"
              role="option"
              aria-selected="${selected}"
            >
              <span class="badge ${statusBadgeClass(runStatus)}">${escapeHtml(runStatus)}</span>
              <span class="agent-name">${escapeHtml(agent.name || "Untitled")}</span>
              <span class="agent-time muted">${escapeHtml(formatTimeSince(agent.updatedAt))}</span>
            </button>
          </li>
        `;
      })
      .join("");
  };

  const load = async (): Promise<void> => {
    if (destroyed) {
      return;
    }
    if (loading) {
      pendingRefresh = true;
      return;
    }

    loading = true;
    render();

    try {
      const result = await client.listAgents({ limit: 50 });
      agents = result.items;
      onAgentsLoaded(agents);
      render();
    } catch (err) {
      if (statusEl) {
        const message = err instanceof Error ? err.message : "Failed to load agents";
        statusEl.textContent = message;
      }
    } finally {
      loading = false;
      if (pendingRefresh && !destroyed) {
        pendingRefresh = false;
        void load();
      }
    }
  };

  const onListClick = (event: MouseEvent): void => {
    const target = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-agent-id]");
    if (!target) {
      return;
    }
    const id = target.dataset.agentId;
    const agent = agents.find((item) => item.id === id);
    if (agent) {
      currentSelectedId = agent.id;
      render();
      onSelect(agent);
    }
  };

  listEl?.addEventListener("click", onListClick);
  refreshBtn?.addEventListener("click", () => {
    void load();
  });

  const pollTimer = window.setInterval(() => {
    void load();
  }, POLL_MS);

  void load();

  return {
    refresh: () => {
      void load();
    },
    getAgents: () => agents,
    destroy: () => {
      destroyed = true;
      window.clearInterval(pollTimer);
      listEl?.removeEventListener("click", onListClick);
      root.replaceChildren();
    }
  };
}
