import { z } from "zod";

export const sessionStatusSchema = z.enum([
  "draft",
  "queued",
  "running",
  "waiting",
  "done",
  "failed"
]);

export type SessionStatus = z.infer<typeof sessionStatusSchema>;

export const cursorModeSchema = z.enum(["agent", "plan", "ask"]);

export type CursorMode = z.infer<typeof cursorModeSchema>;

export const createSessionSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  workspace: z.string().trim().min(1).optional(),
  prompt: z.string().trim().min(1),
  mode: cursorModeSchema.default("agent"),
  model: z.string().trim().min(1).optional(),
  worktree: z.boolean().default(true)
});

export type CreateSessionRequest = z.input<typeof createSessionSchema>;

export const answerSessionSchema = z.object({
  text: z.string().trim().min(1),
  questionId: z.string().trim().min(1).optional()
});

export type AnswerSessionRequest = z.input<typeof answerSessionSchema>;

export type CursorQuestion = {
  id: string;
  sessionId: string;
  text: string;
  createdAt: string;
  answeredAt?: string;
  answer?: string;
};

export type CursorSession = {
  id: string;
  cursorChatId?: string;
  title: string;
  workspace?: string;
  prompt: string;
  mode: CursorMode;
  model?: string;
  worktree: boolean;
  status: SessionStatus;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  exitCode?: number | null;
  error?: string;
  summary?: string;
  outputTail: string[];
  questions: CursorQuestion[];
};

export type SessionsSnapshot = {
  sessions: CursorSession[];
};

export type BridgeEvent =
  | { type: "snapshot"; payload: SessionsSnapshot }
  | { type: "session.updated"; payload: CursorSession }
  | { type: "error"; message: string };

export function summarizeForHud(sessions: CursorSession[]): string[] {
  const waiting = sessions.filter((session) => session.status === "waiting");
  if (waiting.length > 0) {
    const first = waiting[0];
    const question = first.questions.find((item) => !item.answeredAt);
    return [
      "NEEDS YOU",
      String(first.title + ": " + (question?.text ?? "waiting for input")).slice(0, 64),
      String(waiting.length + " waiting session" + (waiting.length === 1 ? "" : "s"))
    ];
  }

  const running = sessions.filter((session) => session.status === "running");
  const done = sessions.filter((session) => session.status === "done");
  if (running.length > 0) {
    return [
      "CURSOR RUNNING",
      running.slice(0, 2).map((session) => session.title).join(" / ").slice(0, 64),
      String(running.length + " running · " + done.length + " done")
    ];
  }

  if (sessions.length === 0) {
    return ["EVENCURSOR", "Dictate a Cursor task", "No sessions yet"];
  }

  return [
    "CURSOR READY",
    String(done.length + " done · " + sessions.filter((s) => s.status === "failed").length + " failed"),
    sessions[0]?.title?.slice(0, 64) ?? "No active work"
  ];
}
