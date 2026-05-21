import type {
  Agent,
  CreateAgentInput,
  CreateRunInput,
  Run,
  RunStreamEvent
} from "./types.js";

export class CursorClient {
  constructor(private readonly apiKey: string) {}

  async me(): Promise<{
    apiKeyName: string;
    userEmail: string;
    createdAt: string;
  }> {
    throw new Error("not implemented: me");
  }

  async listAgents(opts?: {
    limit?: number;
    cursor?: string;
    includeArchived?: boolean;
  }): Promise<{ items: Agent[]; nextCursor: string | null }> {
    throw new Error("not implemented: listAgents");
  }

  async getAgent(id: string): Promise<Agent> {
    throw new Error("not implemented: getAgent");
  }

  async createAgent(
    input: CreateAgentInput
  ): Promise<{ agent: Agent; run: Run }> {
    throw new Error("not implemented: createAgent");
  }

  async listRuns(
    agentId: string,
    opts?: { limit?: number; cursor?: string }
  ): Promise<{ items: Run[]; nextCursor: string | null }> {
    throw new Error("not implemented: listRuns");
  }

  async getRun(agentId: string, runId: string): Promise<Run> {
    throw new Error("not implemented: getRun");
  }

  async createRun(
    agentId: string,
    input: CreateRunInput
  ): Promise<{ run: Run }> {
    throw new Error("not implemented: createRun");
  }

  async cancelRun(agentId: string, runId: string): Promise<{ id: string }> {
    throw new Error("not implemented: cancelRun");
  }

  async *streamRun(
    agentId: string,
    runId: string,
    opts?: { lastEventId?: string; signal?: AbortSignal }
  ): AsyncIterable<RunStreamEvent> {
    throw new Error("not implemented: streamRun");
  }

  /** Best-effort; rate-limited to about once per minute per user. */
  async listRepositories(): Promise<{ items: { url: string }[] }> {
    throw new Error("not implemented: listRepositories");
  }
}
