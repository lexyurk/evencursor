import {
  getCursorApiKey,
  setCursorApiKey,
  setDeepgramApiKey
} from "../cursor/auth.js";
import { CursorClient } from "../cursor/client.js";
import type { Agent } from "../cursor/types.js";
import type { GlassesAdapter } from "../glasses/adapter.js";
import type { KeyStore } from "../storage/storage.js";
import {
  mountAgentDetail,
  type AgentDetailHandle
} from "./AgentDetail.js";
import { mountAgentsList, type AgentsListHandle } from "./AgentsList.js";
import { mountNewAgentDialog } from "./NewAgentDialog.js";
import { mountVoiceBar, type VoiceCommand } from "./VoiceBar.js";

export type AppDeps = {
  root: HTMLElement;
  keyStore: KeyStore;
  glasses: GlassesAdapter;
  onSignOut: () => void;
};

function formatHudRow(agent: Agent): string {
  const status = agent.latestRun?.status ?? agent.status;
  const name = agent.name || "Untitled";
  return `${status}  ${name}`;
}

export function parseNewAgentRest(rest: string): {
  prompt: string;
  repositoryUrl?: string;
} {
  const trimmed = rest.trim();
  const inMatch = /^in\s+(\S+)\s+(.+)$/i.exec(trimmed);
  if (inMatch) {
    const repo = inMatch[1];
    const prompt = inMatch[2].trim();
    const repositoryUrl = repo.startsWith("http")
      ? repo
      : `https://github.com/${repo}`;
    return { prompt, repositoryUrl };
  }
  return { prompt: trimmed };
}

function repoMatches(agent: Agent, repo: string): boolean {
  const url = agent.repositoryUrl ?? "";
  const needle = repo.toLowerCase();
  return (
    url.toLowerCase().includes(needle) ||
    agent.name.toLowerCase().includes(needle)
  );
}

export function mountApp({ root, keyStore, glasses, onSignOut }: AppDeps): () => void {
  let client: CursorClient;
  let agentsHandle: AgentsListHandle | undefined;
  let detailHandle: AgentDetailHandle | undefined;
  let voiceTeardown: (() => void) | undefined;
  let selectionTeardown: (() => void) | undefined;
  let dialogTeardown: (() => void) | undefined;
  let selectedAgent: Agent | null = null;
  let repoFilter: string | null = null;
  let glassesMicAvailable = false;

  root.innerHTML = `
    <div class="app-shell">
      <header class="app-header">
        <h1 class="app-title">evencursor</h1>
        <div class="app-header-actions">
          <a class="app-link-simulator" href="#/simulator" target="_blank" rel="noopener">Open simulator</a>
          <button type="button" class="btn btn-ghost btn-sign-out">Sign out</button>
        </div>
      </header>
      <div class="modal-portal"></div>
      <div class="voice-slot"></div>
      <div class="agents-slot"></div>
      <div class="detail-slot"></div>
    </div>
  `;

  const modalPortal = root.querySelector<HTMLElement>(".modal-portal");
  const voiceSlot = root.querySelector<HTMLElement>(".voice-slot");
  const agentsSlot = root.querySelector<HTMLElement>(".agents-slot");
  const detailSlot = root.querySelector<HTMLElement>(".detail-slot");
  const signOutBtn = root.querySelector<HTMLButtonElement>(".btn-sign-out");

  const openMic = (
    sendPcm: (frame: Int16Array | Uint8Array) => void
  ): Promise<() => void> => glasses.openMic(sendPcm);

  const syncGlassesList = (agents: Agent[]): void => {
    const filter = repoFilter ?? "";
    const visible = filter
      ? agents.filter((agent) => repoMatches(agent, filter))
      : agents;
    const rows = visible.map(formatHudRow);
    const footer = repoFilter
      ? `${visible.length} in ${repoFilter}`
      : `${visible.length} agents · tap to select`;
    void glasses.showAgentList(rows, footer);
  };

  const clearDetail = (): void => {
    detailHandle?.destroy();
    detailHandle = undefined;
    selectedAgent = null;
    if (detailSlot) {
      detailSlot.replaceChildren();
    }
  };

  const openNewAgentDialog = (initial?: {
    prompt?: string;
    repositoryUrl?: string;
    name?: string;
  }): void => {
    if (!modalPortal || !client) {
      return;
    }
    dialogTeardown?.();
    dialogTeardown = mountNewAgentDialog({
      client,
      keyStore,
      portal: modalPortal,
      openMic: glassesMicAvailable ? openMic : undefined,
      initial,
      onCreated: () => {
        repoFilter = null;
        agentsHandle?.refresh();
      },
      onClose: () => {
        dialogTeardown = undefined;
      }
    });
  };

  const selectAgent = (agent: Agent): void => {
    if (!client || !detailSlot) {
      return;
    }

    selectedAgent = agent;
    detailHandle?.destroy();
    detailHandle = mountAgentDetail({
      root: detailSlot,
      agent,
      client,
      glasses,
      openMic: glassesMicAvailable ? openMic : undefined,
      onBack: () => {
        clearDetail();
        const agents = agentsHandle?.getAgents() ?? [];
        syncGlassesList(agents);
      },
      onAgentUpdated: (updated) => {
        selectedAgent = updated;
        agentsHandle?.refresh();
      },
      onDeleted: () => {
        clearDetail();
        agentsHandle?.refresh();
      }
    });
  };

  const handleCommand = (command: VoiceCommand): void => {
    switch (command.verb) {
      case "refresh":
        agentsHandle?.refresh();
        break;
      case "select": {
        const agents = agentsHandle?.getAgents() ?? [];
        const index = command.index - 1;
        const agent = agents[index];
        if (agent) {
          selectAgent(agent);
        }
        break;
      }
      case "open":
        repoFilter = command.repo;
        agentsHandle?.refresh();
        break;
      case "new": {
        const { prompt, repositoryUrl } = parseNewAgentRest(command.rest);
        openNewAgentDialog({
          prompt: prompt || undefined,
          repositoryUrl
        });
        break;
      }
      case "followup": {
        if (!command.rest.trim()) {
          break;
        }
        detailHandle?.applyVoiceFollowUp(command.rest);
        break;
      }
      case "archive": {
        if (!selectedAgent) {
          break;
        }
        const agentId = selectedAgent.id;
        void client.archiveAgent(agentId).then(() => {
          agentsHandle?.refresh();
          return client.getAgent(agentId);
        }).then((updated) => {
          selectAgent(updated);
        });
        break;
      }
      case "unarchive": {
        if (!selectedAgent) {
          break;
        }
        const agentId = selectedAgent.id;
        void client.unarchiveAgent(agentId).then(() => {
          agentsHandle?.refresh();
          return client.getAgent(agentId);
        }).then((updated) => {
          selectAgent(updated);
        });
        break;
      }
      case "delete": {
        if (!selectedAgent) {
          break;
        }
        const label = selectedAgent.name || selectedAgent.id;
        if (!globalThis.confirm(`Delete agent “${label}”?`)) {
          break;
        }
        void client.deleteAgent(selectedAgent.id).then(() => {
          clearDetail();
          agentsHandle?.refresh();
        });
        break;
      }
      case "cancel": {
        if (!selectedAgent?.latestRun) {
          break;
        }
        const run = selectedAgent.latestRun;
        void client.cancelRun(selectedAgent.id, run.id).then(() => {
          agentsHandle?.refresh();
        });
        break;
      }
      case "signin":
      case "signout":
        void signOut();
        break;
      default:
        break;
    }
  };

  const signOut = async (): Promise<void> => {
    await setCursorApiKey(undefined);
    await setDeepgramApiKey(undefined);
    await glasses.shutdown();
    onSignOut();
  };

  signOutBtn?.addEventListener("click", () => {
    void signOut();
  });

  const boot = async (): Promise<void> => {
    const apiKey = await getCursorApiKey();
    if (!apiKey || !voiceSlot || !agentsSlot) {
      return;
    }

    client = new CursorClient(apiKey);
    const { available } = await glasses.init();
    glassesMicAvailable = available;

    voiceTeardown = mountVoiceBar({
      root: voiceSlot,
      onCommand: handleCommand,
      glassesMicAvailable,
      openGlassesMic: (onPcm) => glasses.openMic(onPcm)
    });

    agentsHandle = mountAgentsList({
      root: agentsSlot,
      client,
      selectedId: selectedAgent?.id ?? null,
      onSelect: selectAgent,
      onAgentsLoaded: (agents) => {
        syncGlassesList(agents);
      },
      onNewAgent: () => {
        openNewAgentDialog();
      }
    });

    selectionTeardown = glasses.onSelection((index) => {
      const agents = agentsHandle?.getAgents() ?? [];
      const filter = repoFilter ?? "";
      const visible = filter
        ? agents.filter((agent) => repoMatches(agent, filter))
        : agents;
      const agent = visible[index];
      if (agent) {
        selectAgent(agent);
      }
    });
  };

  void boot();

  return () => {
    selectionTeardown?.();
    voiceTeardown?.();
    dialogTeardown?.();
    agentsHandle?.destroy();
    detailHandle?.destroy();
    root.replaceChildren();
  };
}
