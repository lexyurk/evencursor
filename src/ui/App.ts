import {
  getCursorApiKey,
  setCursorApiKey,
  setDeepgramApiKey
} from "../cursor/auth.js";
import { CursorClient } from "../cursor/client.js";
import type { Agent } from "../cursor/types.js";
import type { GlassesAdapter } from "../glasses/adapter.js";
import type { KeyStore } from "../storage/storage.js";
import { mountAgentDetail } from "./AgentDetail.js";
import { mountAgentsList, type AgentsListHandle } from "./AgentsList.js";
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

function parseNewAgentRest(rest: string): {
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

export function mountApp({ root, glasses, onSignOut }: AppDeps): () => void {

  let client: CursorClient;
  let agentsHandle: AgentsListHandle | undefined;
  let detailTeardown: (() => void) | undefined;
  let voiceTeardown: (() => void) | undefined;
  let selectionTeardown: (() => void) | undefined;
  let selectedAgent: Agent | null = null;
  let repoFilter: string | null = null;
  let glassesMicAvailable = false;

  root.innerHTML = `
    <div class="app-shell">
      <header class="app-header">
        <h1 class="app-title">evencursor</h1>
        <button type="button" class="btn btn-ghost btn-sign-out">Sign out</button>
      </header>
      <div class="voice-slot"></div>
      <div class="agents-slot"></div>
      <div class="detail-slot"></div>
    </div>
  `;

  const voiceSlot = root.querySelector<HTMLElement>(".voice-slot");
  const agentsSlot = root.querySelector<HTMLElement>(".agents-slot");
  const detailSlot = root.querySelector<HTMLElement>(".detail-slot");
  const signOutBtn = root.querySelector<HTMLButtonElement>(".btn-sign-out");

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
    detailTeardown?.();
    detailTeardown = undefined;
    selectedAgent = null;
    if (detailSlot) {
      detailSlot.replaceChildren();
    }
  };

  const selectAgent = (agent: Agent): void => {
    if (!client || !detailSlot) {
      return;
    }

    selectedAgent = agent;
    detailTeardown?.();
    detailTeardown = mountAgentDetail({
      root: detailSlot,
      agent,
      client,
      glasses,
      onBack: () => {
        clearDetail();
        const agents = agentsHandle?.getAgents() ?? [];
        syncGlassesList(agents);
      },
      onAgentUpdated: (updated) => {
        selectedAgent = updated;
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
        if (!prompt) {
          break;
        }
        void client
          .createAgent({ prompt, repositoryUrl, name: prompt.slice(0, 48) })
          .then(() => {
            repoFilter = null;
            agentsHandle?.refresh();
          });
        break;
      }
      case "followup": {
        if (!selectedAgent || !command.rest.trim()) {
          break;
        }
        void client
          .createRun(selectedAgent.id, { prompt: command.rest.trim() })
          .then(() => {
            agentsHandle?.refresh();
            if (selectedAgent) {
              void client.getAgent(selectedAgent.id).then(selectAgent);
            }
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
    agentsHandle?.destroy();
    detailTeardown?.();
    root.replaceChildren();
  };
}
