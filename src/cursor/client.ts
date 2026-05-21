import { basicAuthHeader } from "./auth.js";
import {
  CursorApiError,
  StreamExpiredError,
  type Agent,
  type CreateAgentInput,
  type CreateRunInput,
  type Run,
  type RunStatus,
  type RunStreamEvent
} from "./types.js";

const BASE_URL = "https://api.cursor.com";

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (
        !(err instanceof CursorApiError) ||
        !RETRYABLE_STATUSES.has(err.status) ||
        attempt === MAX_ATTEMPTS - 1
      ) {
        throw err;
      }
      await sleep(2 ** attempt * 250);
    }
  }
  throw lastError;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readErrorBody(body: unknown): { code?: string; message: string } {
  if (!isRecord(body)) {
    return { message: "Request failed" };
  }
  const err = body.error;
  if (isRecord(err)) {
    const message =
      typeof err.message === "string" ? err.message : "Request failed";
    const code = typeof err.code === "string" ? err.code : undefined;
    return { code, message };
  }
  if (typeof body.message === "string") {
    return { message: body.message };
  }
  return { message: "Request failed" };
}

async function parseApiError(response: Response): Promise<CursorApiError> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }
  const { code, message } = readErrorBody(body);
  return new CursorApiError(response.status, message, code);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function normalizeRunStatus(value: unknown): RunStatus {
  if (typeof value !== "string" || value.length === 0) {
    return "ERRORED";
  }
  const upper = value.toUpperCase();
  if (
    upper === "CREATING" ||
    upper === "RUNNING" ||
    upper === "FINISHED" ||
    upper === "ERRORED" ||
    upper === "CANCELLED" ||
    upper === "EXPIRED"
  ) {
    return upper;
  }
  const terminal = /FINISHED|ERRORED|CANCELLED|EXPIRED|FAILED|DONE/.test(upper);
  return terminal ? "ERRORED" : "RUNNING";
}

function normalizeRun(raw: unknown, agentId?: string): Run {
  const o = isRecord(raw) ? raw : {};
  const id = asString(o.id) ?? "";
  const resolvedAgentId = asString(o.agentId) ?? agentId ?? "";
  return {
    id,
    agentId: resolvedAgentId,
    status: normalizeRunStatus(o.status),
    prompt: asString(o.prompt),
    createdAt: asString(o.createdAt) ?? "",
    updatedAt: asString(o.updatedAt) ?? ""
  };
}

function normalizeAgent(raw: unknown): Agent {
  const o = isRecord(raw) ? raw : {};
  const latestRunRaw = o.latestRun;
  const agent: Agent = {
    id: asString(o.id) ?? "",
    name: asString(o.name) ?? "",
    status: asString(o.status) ?? "",
    repositoryUrl: asString(o.repositoryUrl) ?? asString(o.repository_url),
    createdAt: asString(o.createdAt) ?? "",
    updatedAt: asString(o.updatedAt) ?? "",
    archived: typeof o.archived === "boolean" ? o.archived : undefined
  };
  if (latestRunRaw !== undefined) {
    agent.latestRun = normalizeRun(latestRunRaw, agent.id);
  }
  return agent;
}

function listItems<T>(
  body: unknown,
  mapItem: (raw: unknown) => T
): { items: T[]; nextCursor: string | null } {
  const o = isRecord(body) ? body : {};
  const rawItems = Array.isArray(o.items) ? o.items : [];
  const nextCursor =
    asString(o.nextCursor) ?? asString(o.next_cursor) ?? null;
  return { items: rawItems.map(mapItem), nextCursor };
}

export type SseEventBlock = {
  id?: string;
  event?: string;
  data: string;
};

export function parseSseBlocks(buffer: string): {
  blocks: SseEventBlock[];
  remainder: string;
} {
  const normalized = buffer.replace(/\r\n/g, "\n");
  const parts = normalized.split("\n\n");
  const remainder = parts.pop() ?? "";
  const blocks: SseEventBlock[] = [];

  for (const part of parts) {
    if (!part.trim()) {
      continue;
    }
    let id: string | undefined;
    let event: string | undefined;
    const dataLines: string[] = [];

    for (const line of part.split("\n")) {
      if (line.startsWith(":")) {
        continue;
      }
      if (line.startsWith("id:")) {
        id = line.slice(3).trim();
        continue;
      }
      if (line.startsWith("event:")) {
        event = line.slice(6).trim();
        continue;
      }
      if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).trimStart());
      }
    }

    if (dataLines.length > 0 || event) {
      blocks.push({
        id,
        event,
        data: dataLines.join("\n")
      });
    }
  }

  return { blocks, remainder };
}

export function mapSseBlockToRunStreamEvent(block: SseEventBlock): RunStreamEvent | null {
  const eventName = (block.event ?? "").toLowerCase();
  if (!eventName) {
    return null;
  }

  let payload: unknown;
  if (block.data.length > 0) {
    try {
      payload = JSON.parse(block.data);
    } catch {
      payload = block.data;
    }
  }

  const raw = payload;
  const record = isRecord(payload) ? payload : undefined;

  switch (eventName) {
    case "status": {
      const status = normalizeRunStatus(record?.status ?? payload);
      return { type: "status", status, raw };
    }
    case "assistant": {
      const delta =
        asString(record?.delta) ??
        asString(record?.text) ??
        (typeof payload === "string" ? payload : "");
      return { type: "assistant", delta, raw };
    }
    case "thinking": {
      const delta =
        asString(record?.delta) ??
        asString(record?.text) ??
        (typeof payload === "string" ? payload : "");
      return { type: "thinking", delta, raw };
    }
    case "tool_call": {
      const name =
        asString(record?.name) ??
        asString(record?.tool) ??
        asString(record?.toolName) ??
        "tool";
      return { type: "tool_call", name, raw };
    }
    case "result": {
      const summary =
        asString(record?.summary) ??
        asString(record?.message) ??
        asString(record?.text);
      return { type: "result", summary, raw };
    }
    case "heartbeat":
      return { type: "heartbeat", raw };
    case "error": {
      const message =
        asString(record?.message) ??
        (typeof payload === "string" ? payload : "Stream error");
      const code = asString(record?.code);
      return { type: "error", message, code, raw };
    }
    case "done":
      return { type: "done", raw };
    default:
      return null;
  }
}

export class CursorClient {
  private readonly authHeader: string;

  constructor(apiKey: string) {
    this.authHeader = basicAuthHeader(apiKey);
  }

  private async request<T>(
    path: string,
    init?: RequestInit
  ): Promise<T> {
    return withRetry(async () => {
      const response = await fetch(`${BASE_URL}${path}`, {
        ...init,
        headers: {
          Authorization: this.authHeader,
          Accept: "application/json",
          ...(init?.headers ?? {})
        }
      });

      if (!response.ok) {
        if (response.status === 410) {
          throw new StreamExpiredError();
        }
        throw await parseApiError(response);
      }

      if (response.status === 204) {
        return undefined as T;
      }

      return (await response.json()) as T;
    });
  }

  async me(): Promise<{
    apiKeyName: string;
    userEmail: string;
    createdAt: string;
  }> {
    const body = await this.request<Record<string, unknown>>("/v1/me");
    return {
      apiKeyName: asString(body.apiKeyName) ?? "",
      userEmail: asString(body.userEmail) ?? "",
      createdAt: asString(body.createdAt) ?? ""
    };
  }

  async listAgents(opts?: {
    limit?: number;
    cursor?: string;
    includeArchived?: boolean;
  }): Promise<{ items: Agent[]; nextCursor: string | null }> {
    const params = new URLSearchParams();
    if (opts?.limit !== undefined) {
      params.set("limit", String(opts.limit));
    }
    if (opts?.cursor) {
      params.set("cursor", opts.cursor);
    }
    if (opts?.includeArchived !== undefined) {
      params.set("includeArchived", String(opts.includeArchived));
    }
    const qs = params.toString();
    const body = await this.request<unknown>(
      `/v1/agents${qs ? `?${qs}` : ""}`
    );
    return listItems(body, normalizeAgent);
  }

  async getAgent(id: string): Promise<Agent> {
    const body = await this.request<unknown>(`/v1/agents/${encodeURIComponent(id)}`);
    if (isRecord(body) && body.agent !== undefined) {
      return normalizeAgent(body.agent);
    }
    return normalizeAgent(body);
  }

  async createAgent(
    input: CreateAgentInput
  ): Promise<{ agent: Agent; run: Run }> {
    const body = await this.request<Record<string, unknown>>("/v1/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input)
    });
    const agent = normalizeAgent(body.agent ?? body);
    const run = normalizeRun(body.run, agent.id);
    return { agent, run };
  }

  async listRuns(
    agentId: string,
    opts?: { limit?: number; cursor?: string }
  ): Promise<{ items: Run[]; nextCursor: string | null }> {
    const params = new URLSearchParams();
    if (opts?.limit !== undefined) {
      params.set("limit", String(opts.limit));
    }
    if (opts?.cursor) {
      params.set("cursor", opts.cursor);
    }
    const qs = params.toString();
    const body = await this.request<unknown>(
      `/v1/agents/${encodeURIComponent(agentId)}/runs${qs ? `?${qs}` : ""}`
    );
    return listItems(body, (raw) => normalizeRun(raw, agentId));
  }

  async getRun(agentId: string, runId: string): Promise<Run> {
    const body = await this.request<Record<string, unknown>>(
      `/v1/agents/${encodeURIComponent(agentId)}/runs/${encodeURIComponent(runId)}`
    );
    if (body.run !== undefined) {
      return normalizeRun(body.run, agentId);
    }
    return normalizeRun(body, agentId);
  }

  async createRun(
    agentId: string,
    input: CreateRunInput
  ): Promise<{ run: Run }> {
    const body = await this.request<Record<string, unknown>>(
      `/v1/agents/${encodeURIComponent(agentId)}/runs`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input)
      }
    );
    const run = normalizeRun(body.run ?? body, agentId);
    return { run };
  }

  async cancelRun(agentId: string, runId: string): Promise<{ id: string }> {
    const body = await this.request<Record<string, unknown>>(
      `/v1/agents/${encodeURIComponent(agentId)}/runs/${encodeURIComponent(runId)}/cancel`,
      { method: "POST" }
    );
    return { id: asString(body.id) ?? runId };
  }

  async *streamRun(
    agentId: string,
    runId: string,
    opts?: { lastEventId?: string; signal?: AbortSignal }
  ): AsyncIterable<RunStreamEvent> {
    const headers: Record<string, string> = {
      Authorization: this.authHeader,
      Accept: "text/event-stream"
    };
    if (opts?.lastEventId) {
      headers["Last-Event-ID"] = opts.lastEventId;
    }

    const response = await fetch(
      `${BASE_URL}/v1/agents/${encodeURIComponent(agentId)}/runs/${encodeURIComponent(runId)}/stream`,
      { headers, signal: opts?.signal }
    );

    if (response.status === 410) {
      throw new StreamExpiredError();
    }

    if (!response.ok) {
      throw await parseApiError(response);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new CursorApiError(0, "Response body is not readable");
    }

    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        const { blocks, remainder } = parseSseBlocks(buffer);
        buffer = remainder;

        for (const block of blocks) {
          const event = mapSseBlockToRunStreamEvent(block);
          if (event) {
            yield event;
          }
        }
      }

      if (buffer.trim().length > 0) {
        const { blocks } = parseSseBlocks(`${buffer}\n\n`);
        for (const block of blocks) {
          const event = mapSseBlockToRunStreamEvent(block);
          if (event) {
            yield event;
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /** Best-effort; rate-limited to about once per minute per user. */
  async listRepositories(): Promise<{ items: { url: string }[] }> {
    const body = await this.request<unknown>("/v1/repositories");
    const { items } = listItems(body, (raw) => {
      const o = isRecord(raw) ? raw : {};
      return { url: asString(o.url) ?? "" };
    });
    return { items };
  }
}

export { CursorApiError, StreamExpiredError } from "./types.js";
