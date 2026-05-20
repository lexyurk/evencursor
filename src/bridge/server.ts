import "dotenv/config";

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { WebSocketServer, type WebSocket } from "ws";
import {
  answerSessionSchema,
  createSessionSchema,
  type BridgeEvent,
  type CursorSession,
  type SessionsSnapshot
} from "../shared/protocol.js";
import { CursorRunner } from "./cursor-runner.js";

const port = Number(process.env.EVENCURSOR_PORT ?? 8787);
const sessions = new Map<string, CursorSession>();
const sockets = new Set<WebSocket>();

const runner = new CursorRunner({
  cursorAgentBin: process.env.CURSOR_AGENT_BIN ?? "cursor-agent",
  defaultWorkspace: process.env.EVENCURSOR_DEFAULT_WORKSPACE,
  onUpdate: (session) => {
    sessions.set(session.id, session);
    broadcast({ type: "session.updated", payload: session });
  }
});

const server = createServer(async (request, response) => {
  try {
    await route(request, response);
  } catch (error) {
    sendJson(response, 500, {
      error: error instanceof Error ? error.message : "Unknown server error"
    });
  }
});

const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (socket) => {
  sockets.add(socket);
  socket.send(JSON.stringify(snapshotEvent()));
  socket.on("close", () => sockets.delete(socket));
});

server.listen(port, () => {
  console.log("evencursor bridge listening on http://localhost:" + port);
});

async function route(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url ?? "/", "http://" + (request.headers.host ?? "localhost"));

  if (request.method === "OPTIONS") {
    sendJson(response, 204, {});
    return;
  }

  if (request.method === "GET" && url.pathname === "/health") {
    sendJson(response, 200, {
      ok: true,
      name: "evencursor",
      sessions: sessions.size
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/sessions") {
    sendJson(response, 200, snapshot());
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/sessions") {
    const input = createSessionSchema.parse(await readJson(request));
    const id = randomUUID();
    const now = new Date().toISOString();
    const session: CursorSession = {
      id,
      cursorChatId: await runner.createChat(),
      title: input.title ?? inferTitle(input.prompt),
      workspace: input.workspace,
      prompt: input.prompt,
      mode: input.mode,
      model: input.model,
      worktree: input.worktree,
      status: "queued",
      createdAt: now,
      updatedAt: now,
      outputTail: [],
      questions: []
    };

    sessions.set(id, session);
    broadcast({ type: "session.updated", payload: session });
    void runner.start(session, input.prompt);
    sendJson(response, 201, session);
    return;
  }

  const answerMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/answer$/);
  if (request.method === "POST" && answerMatch) {
    const session = sessions.get(answerMatch[1]);
    if (!session) {
      sendJson(response, 404, { error: "Session not found" });
      return;
    }

    const input = answerSessionSchema.parse(await readJson(request));
    const question =
      (input.questionId && session.questions.find((item) => item.id === input.questionId)) ??
      session.questions.find((item) => !item.answeredAt);

    if (question) {
      question.answer = input.text;
      question.answeredAt = new Date().toISOString();
    }

    session.status = "queued";
    session.updatedAt = new Date().toISOString();
    broadcast({ type: "session.updated", payload: session });

    const prompt = [
      "Human answer from evencursor voice inbox:",
      input.text,
      "",
      "Continue the same Cursor session. If you need another human decision, ask one concise question."
    ].join("\n");

    void runner.start(session, prompt);
    sendJson(response, 202, session);
    return;
  }

  sendJson(response, 404, { error: "Not found" });
}

function snapshot(): SessionsSnapshot {
  return {
    sessions: [...sessions.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  };
}

function snapshotEvent(): BridgeEvent {
  return { type: "snapshot", payload: snapshot() };
}

function broadcast(event: BridgeEvent): void {
  const payload = JSON.stringify(event);
  for (const socket of sockets) {
    if (socket.readyState === socket.OPEN) {
      socket.send(payload);
    }
  }
}

function readJson(request: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk: Buffer) => {
      body += chunk.toString("utf8");
      if (body.length > 100_000) {
        reject(new Error("Request body too large"));
        request.destroy();
      }
    });
    request.on("end", () => {
      if (!body.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type"
  });
  response.end(JSON.stringify(body));
}

function inferTitle(prompt: string): string {
  return (
    prompt
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean)
      ?.slice(0, 80) ?? "Cursor session"
  );
}
