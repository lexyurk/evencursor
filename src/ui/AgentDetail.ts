import type { Agent } from "../cursor/types.js";
import type { GlassesAdapter } from "../glasses/adapter.js";

export type AgentDetailDeps = {
  root: HTMLElement;
  agent: Agent;
  glasses: GlassesAdapter;
  onBack: () => void;
};

export function mountAgentDetail(_deps: AgentDetailDeps): () => void {
  throw new Error("not implemented: mountAgentDetail");
}
