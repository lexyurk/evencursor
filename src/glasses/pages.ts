import type {
  CreateStartUpPageContainer,
  RebuildPageContainer
} from "@evenrealities/even_hub_sdk";

export type AgentDetailPageArgs = {
  title: string;
  statusLine: string;
  lastDelta: string;
  footer: string;
};

export function buildAgentListPage(
  rows: string[],
  footer: string
): CreateStartUpPageContainer {
  throw new Error("not implemented: buildAgentListPage");
}

export function buildAgentDetailPage(
  args: AgentDetailPageArgs
): RebuildPageContainer {
  throw new Error("not implemented: buildAgentDetailPage");
}
