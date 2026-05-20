import {
  summarizeForHud,
  type BridgeEvent,
  type CursorMode,
  type CursorQuestion,
  type CursorSession
} from "../shared/protocol";
import { renderEvenHud } from "./even";
import { createDictation } from "./speech";
import "./styles.css";

const apiBase = import.meta.env.VITE_EVENCURSOR_API_URL ?? "http://localhost:8787";
const wsUrl =
  import.meta.env.VITE_EVENCURSOR_WS_URL ??
  apiBase.replace(/^http/, "ws").replace(/\/$/, "") + "/ws";

const state: { sessions: CursorSession[]; draftText: string; listening: boolean } = {
  sessions: [],
  draftText: "",
  listening: false
};

const dictation = createDictation("en-US");
const app = document.querySelector<HTMLElement>("#app");

if (!app) {
  throw new Error("Missing #app");
}

const appElement = app;

connectWebSocket();
void loadSessions();
render();

function connectWebSocket(): void {
  const socket = new WebSocket(wsUrl);
  socket.onmessage = (event) => {
    const message = JSON.parse(String(event.data)) as BridgeEvent;
    if (message.type === "snapshot") {
      state.sessions = message.payload.sessions;
    }
    if (message.type === "session.updated") {
      const next = state.sessions.filter((session) => session.id !== message.payload.id);
      state.sessions = [message.payload, ...next].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    }
    render();
  };
  socket.onclose = () => {
    window.setTimeout(connectWebSocket, 1500);
  };
}

async function loadSessions(): Promise<void> {
  const response = await fetch(apiBase + "/api/sessions");
  const data = (await response.json()) as { sessions: CursorSession[] };
  state.sessions = data.sessions;
  render();
}

function render(): void {
  const waiting = state.sessions.flatMap((session) =>
    session.questions.filter((question) => !question.answeredAt).map((question) => ({ session, question }))
  );
  const hudLines = summarizeForHud(state.sessions);
  void renderEvenHud(hudLines);

  appElement.innerHTML = [
    '<section class="hud">',
    '<p class="eyebrow">evencursor</p>',
    "<h1>" + escapeHtml(hudLines[0] ?? "EVENCURSOR") + "</h1>",
    '<p class="hud-line">' + escapeHtml(hudLines[1] ?? "Cursor voice inbox") + "</p>",
    '<p class="hud-meta">' + escapeHtml(hudLines[2] ?? "Ready") + "</p>",
    "</section>",
    '<section class="panel">',
    "<h2>New Cursor Session</h2>",
    '<label>Workspace <input id="workspace" value="' +
      escapeHtml(localStorage.getItem("evencursor.workspace") ?? "") +
      '" placeholder="/path/to/repo" /></label>',
    '<label>Title <input id="title" placeholder="Short label" /></label>',
    '<label>Task <textarea id="prompt" placeholder="Dictate or type the Cursor task">' +
      escapeHtml(state.draftText) +
      "</textarea></label>",
    '<div class="row">',
    '<select id="mode"><option value="agent">Agent</option><option value="plan">Plan</option><option value="ask">Ask</option></select>',
    '<label class="checkbox"><input id="worktree" type="checkbox" checked /> worktree</label>',
    "</div>",
    '<div class="row">',
    '<button id="dictate-task">' + (state.listening ? "Listening..." : "Dictate task") + "</button>",
    '<button id="launch">Launch Cursor</button>',
    "</div>",
    "</section>",
    '<section class="panel">',
    "<h2>Needs You</h2>",
    waiting.length === 0
      ? '<p class="muted">No pending Cursor questions.</p>'
      : waiting.map(({ session, question }) => renderQuestion(session, question)).join(""),
    "</section>",
    '<section class="panel">',
    "<h2>Sessions</h2>",
    state.sessions.length === 0
      ? '<p class="muted">No sessions yet.</p>'
      : state.sessions.map(renderSession).join(""),
    "</section>"
  ].join("");

  bindEvents();
}

function bindEvents(): void {
  document.querySelector<HTMLButtonElement>("#dictate-task")?.addEventListener("click", () => {
    startDictation((text) => {
      state.draftText = text;
      render();
    });
  });

  document.querySelector<HTMLButtonElement>("#launch")?.addEventListener("click", () => {
    void launchSession();
  });

  document.querySelectorAll<HTMLButtonElement>("[data-answer]").forEach((button) => {
    button.addEventListener("click", () => {
      const sessionId = button.dataset.sessionId;
      const questionId = button.dataset.questionId;
      const input = document.querySelector<HTMLTextAreaElement>('[data-reply-input="' + questionId + '"]');
      if (sessionId && input?.value.trim()) {
        void answerQuestion(sessionId, questionId, input.value.trim());
      }
    });
  });

  document.querySelectorAll<HTMLButtonElement>("[data-dictate-reply]").forEach((button) => {
    button.addEventListener("click", () => {
      const questionId = button.dataset.questionId;
      startDictation((text) => {
        const input = document.querySelector<HTMLTextAreaElement>('[data-reply-input="' + questionId + '"]');
        if (input) {
          input.value = text;
        }
      });
    });
  });
}

async function launchSession(): Promise<void> {
  const workspace = document.querySelector<HTMLInputElement>("#workspace")?.value.trim();
  const title = document.querySelector<HTMLInputElement>("#title")?.value.trim();
  const prompt = document.querySelector<HTMLTextAreaElement>("#prompt")?.value.trim();
  const mode = document.querySelector<HTMLSelectElement>("#mode")?.value as CursorMode | undefined;
  const worktree = document.querySelector<HTMLInputElement>("#worktree")?.checked ?? true;

  if (!prompt) {
    return;
  }
  if (workspace) {
    localStorage.setItem("evencursor.workspace", workspace);
  }

  await fetch(apiBase + "/api/sessions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ workspace: workspace || undefined, title: title || undefined, prompt, mode, worktree })
  });

  state.draftText = "";
  render();
}

async function answerQuestion(sessionId: string, questionId: string | undefined, text: string): Promise<void> {
  await fetch(apiBase + "/api/sessions/" + encodeURIComponent(sessionId) + "/answer", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ questionId, text })
  });
}

function startDictation(onFinal: (text: string) => void): void {
  if (!dictation.supported) {
    alert("SpeechRecognition is not supported in this browser.");
    return;
  }

  state.listening = true;
  render();
  dictation.start(
    (text) => {
      state.listening = false;
      onFinal(text);
    },
    () => undefined
  );
}

function renderQuestion(session: CursorSession, question: CursorQuestion): string {
  return [
    '<article class="item urgent">',
    '<div><strong>' + escapeHtml(session.title) + "</strong>",
    '<p>' + escapeHtml(question.text) + "</p></div>",
    '<textarea data-reply-input="' + escapeHtml(question.id) + '" placeholder="Answer by voice or type"></textarea>',
    '<div class="row">',
    '<button data-dictate-reply data-question-id="' + escapeHtml(question.id) + '">Dictate reply</button>',
    '<button data-answer data-session-id="' +
      escapeHtml(session.id) +
      '" data-question-id="' +
      escapeHtml(question.id) +
      '">Send answer</button>',
    "</div>",
    "</article>"
  ].join("");
}

function renderSession(session: CursorSession): string {
  return [
    '<article class="item">',
    '<div class="session-head"><strong>' + escapeHtml(session.title) + "</strong>",
    '<span class="status ' + escapeHtml(session.status) + '">' + escapeHtml(session.status) + "</span></div>",
    session.workspace ? '<p class="muted">' + escapeHtml(session.workspace) + "</p>" : "",
    session.summary ? '<pre>' + escapeHtml(session.summary) + "</pre>" : "",
    session.error ? '<pre class="error">' + escapeHtml(session.error) + "</pre>" : "",
    "</article>"
  ].join("");
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    };
    return entities[char] ?? char;
  });
}
