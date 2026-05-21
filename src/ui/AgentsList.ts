import type { Agent } from "../cursor/types.js";

export type AgentsListDeps = {
  root: HTMLElement;
  onSelect: (agent: Agent) => void;
};

export function mountAgentsList(_deps: AgentsListDeps): () => void {
  throw new Error("not implemented: mountAgentsList");
}
