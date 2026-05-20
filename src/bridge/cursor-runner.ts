import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { CursorQuestion, CursorSession } from "../shared/protocol.js";

export type CursorRunnerOptions = {
  cursorAgentBin: string;
  defaultWorkspace?: string;
  onUpdate: (session: CursorSession) => void;
};

export class CursorRunner {
  private readonly cursorAgentBin: string;
  private readonly defaultWorkspace?: string;
  private readonly onUpdate: (session: CursorSession) => void;

  constructor(options: CursorRunnerOptions) {
    this.cursorAgentBin = options.cursorAgentBin;
    this.defaultWorkspace = options.defaultWorkspace;
    this.onUpdate = options.onUpdate;
  }

  async createChat(): Promise<string | undefined> {
    const result = await this.runCapture(["create-chat"]);
    if (result.exitCode !== 0) {
      return undefined;
    }

    const match = result.output.match(/[0-9a-fA-F-]{12,}|[A-Za-z0-9_-]{12,}/);
    return match?.[0];
  }

  async start(session: CursorSession, prompt: string): Promise<void> {
    const workspace = session.workspace ?? this.defaultWorkspace;
    const args = ["--print", "--output-format", "text", "--trust"];

    if (session.cursorChatId) {
      args.push("--resume", session.cursorChatId);
    }
    if (session.mode !== "agent") {
      args.push("--mode", session.mode);
    }
    if (session.model) {
      args.push("--model", session.model);
    }
    if (workspace) {
      args.push("--workspace", workspace);
    }
    if (session.worktree) {
      args.push("--worktree");
    }

    args.push(prompt);

    session.status = "running";
    session.startedAt ??= new Date().toISOString();
    session.updatedAt = new Date().toISOString();
    this.onUpdate(session);

    const child = spawn(this.cursorAgentBin, args, {
      cwd: workspace,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"]
    });

    const append = (chunk: Buffer, source: "stdout" | "stderr") => {
      const lines = chunk
        .toString("utf8")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => (source === "stderr" ? "stderr: " + line : line));

      if (lines.length === 0) {
        return;
      }

      session.outputTail.push(...lines);
      session.outputTail = session.outputTail.slice(-40);
      session.updatedAt = new Date().toISOString();
      this.onUpdate(session);
    };

    child.stdout.on("data", (chunk: Buffer) => append(chunk, "stdout"));
    child.stderr.on("data", (chunk: Buffer) => append(chunk, "stderr"));

    child.on("error", (error) => {
      session.status = "failed";
      session.error = error.message;
      session.updatedAt = new Date().toISOString();
      this.onUpdate(session);
    });

    child.on("close", (exitCode) => {
      session.exitCode = exitCode;
      session.completedAt = new Date().toISOString();
      session.updatedAt = new Date().toISOString();

      if (exitCode === 0) {
        const questions = extractQuestions(session.id, session.outputTail.join("\n"));
        const unanswered = questions.filter(
          (question) => !session.questions.some((existing) => existing.text === question.text)
        );
        session.questions.push(...unanswered);
        session.status = unanswered.length > 0 ? "waiting" : "done";
        session.summary = summarizeOutput(session.outputTail.join("\n"));
      } else {
        session.status = "failed";
        session.error = session.outputTail.slice(-8).join("\n") || "cursor-agent exited " + exitCode;
      }

      this.onUpdate(session);
    });
  }

  private runCapture(args: string[]): Promise<{ exitCode: number | null; output: string }> {
    return new Promise((resolve) => {
      const child = spawn(this.cursorAgentBin, args, {
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"]
      });
      let output = "";

      child.stdout.on("data", (chunk: Buffer) => {
        output += chunk.toString("utf8");
      });
      child.stderr.on("data", (chunk: Buffer) => {
        output += chunk.toString("utf8");
      });
      child.on("error", (error) => {
        resolve({ exitCode: 1, output: error.message });
      });
      child.on("close", (exitCode) => {
        resolve({ exitCode, output });
      });
    });
  }
}

function extractQuestions(sessionId: string, output: string): CursorQuestion[] {
  const candidates = output
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*\d.)\s]+/, "").trim())
    .filter((line) => {
      if (line.length < 12 || line.length > 220) {
        return false;
      }
      return (
        line.endsWith("?") ||
        /^question:/i.test(line) ||
        /^should i\b/i.test(line) ||
        /^do you want\b/i.test(line) ||
        /^please clarify\\b/i.test(line)
      );
    })
    .slice(0, 5);

  return candidates.map((text) => ({
    id: randomUUID(),
    sessionId,
    text,
    createdAt: new Date().toISOString()
  }));
}

function summarizeOutput(output: string): string {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith("stderr:"))
    .slice(-8);

  return lines.join("\n").slice(0, 1200);
}
