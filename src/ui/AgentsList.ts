import { CursorClient } from "../cursor/client.js";
import type { Agent } from "../cursor/types.js";
import { escapeHtml, formatTimeSince, statusBadgeClass } from "./utils.js";

const POLL_MS = 10_000;

export type AgentsListDeps = {
  root: HTMLElement;
  client: CursorClient;
  selectedId: string | null;
  onSelect: (agent: Agent) => void;
  onAgentsLoaded: (agents: Agent[]) => void;
  onNewAgent?: () => void;
};

export type AgentsListHandle = {
  refresh: () => void;
  getAgents: () => Agent[];
  destroy: () => void;
};

export function mountAgentsList(deps: AgentsListDeps): AgentsListHandle {
  const { root, client, selectedId, onSelect, onAgentsLoaded, onNewAgent } = deps;

  root.innerHTML = `
    <section class="agents-list">
      <div class="agents-list-header">
        <h2>Agents</h2>
        <div class="agents-list-header-actions">
          <label class="toggle-archived">
            <input type="checkbox" class="chk-show-archived" />
            <span>Show archived</span>
          </label>
          <button type="button" class="btn btn-ghost btn-new-agent">+ New agent</button>
          <button type="button" class="btn btn-ghost btn-refresh" aria-label="Refresh agents">Refresh</button>
        </div>
      </div>
      <p class="agents-list-status muted" role="status">Loading…</p>
      <ul class="agents-list-items" role="listbox" aria-label="Cloud agents"></ul>
    </section>
  `;

  const statusEl = root.querySelector<HTMLElement>(".agents-list-status");
  const listEl = root.querySelector<HTMLUListElement>(".agents-list-items");
  const refreshBtn = root.querySelector<HTMLButtonElement>(".btn-refresh");
  const newAgentBtn = root.querySelector<HTMLButtonElement>(".btn-new-agent");
  const showArchivedChk = root.querySelector<HTMLInputElement>(".chk-show-archived");

  let agents: Agent[] = [];
  let includeArchived = false;
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
        const archivedBadge = agent.archived
          ? '<span class="badge badge-archived">Archived</span>'
          : "";
        return `
          <li>
            <button
              type="button"
              class="agent-row${selected ? " agent-row-selected" : ""}${agent.archived ? " agent-row-archived" : ""}"
              data-agent-id="${escapeHtml(agent.id)}"
              role="option"
              aria-selected="${selected}"
            >
              <span class="badge ${statusBadgeClass(runStatus)}">${escapeHtml(runStatus)}</span>
              ${archivedBadge}
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
      const result = await client.listAgents({
        limit: 50,
        includeArchived
      });
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

  newAgentBtn?.addEventListener("click", () => {
    onNewAgent?.();
  });

  showArchivedChk?.addEventListener("change", () => {
    includeArchived = showArchivedChk.checked;
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
