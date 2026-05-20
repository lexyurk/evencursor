import { describe, expect, it } from "vitest";
import { summarizeForHud, type CursorSession } from "./protocol.js";

function session(overrides: Partial<CursorSession>): CursorSession {
  const now = "2026-05-20T00:00:00.000Z";
  return {
    id: "session-1",
    title: "Fix auth flow",
    prompt: "Fix auth flow",
    mode: "agent",
    worktree: true,
    status: "running",
    createdAt: now,
    updatedAt: now,
    outputTail: [],
    questions: [],
    ...overrides
  };
}

describe("summarizeForHud", () => {
  it("prioritizes sessions waiting for human input", () => {
    const lines = summarizeForHud([
      session({
        status: "waiting",
        questions: [
          {
            id: "question-1",
            sessionId: "session-1",
            text: "Should I inspect first or patch immediately?",
            createdAt: "2026-05-20T00:01:00.000Z"
          }
        ]
      }),
      session({ id: "session-2", status: "running" })
    ]);

    expect(lines[0]).toBe("NEEDS YOU");
    expect(lines[1]).toContain("Should I inspect first");
  });
});
