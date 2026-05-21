export type RunStatus =
  | "CREATING"
  | "RUNNING"
  | "FINISHED"
  | "ERRORED"
  | "CANCELLED"
  | "EXPIRED"
  | (string & {});

export type Agent = {
  id: string;
  name: string;
  status: string;
  repositoryUrl?: string;
  createdAt: string;
  updatedAt: string;
  archived?: boolean;
  latestRun?: Run;
};

export type Run = {
  id: string;
  agentId: string;
  status: RunStatus;
  prompt?: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateAgentInput = {
  prompt: string;
  repositoryUrl?: string;
  name?: string;
};

export type CreateRunInput = {
  prompt: string;
};

export type RunStreamEvent =
  | { type: "status"; status: RunStatus; raw?: unknown }
  | { type: "assistant"; delta: string; raw?: unknown }
  | { type: "thinking"; delta: string; raw?: unknown }
  | { type: "tool_call"; name: string; raw?: unknown }
  | { type: "result"; summary?: string; raw?: unknown }
  | { type: "heartbeat"; raw?: unknown }
  | { type: "error"; message: string; code?: string; raw?: unknown }
  | { type: "done"; raw?: unknown };

export class CursorApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = "CursorApiError";
    this.status = status;
    this.code = code;
  }
}

export class StreamExpiredError extends Error {
  constructor(message = "Run stream expired") {
    super(message);
    this.name = "StreamExpiredError";
  }
}
