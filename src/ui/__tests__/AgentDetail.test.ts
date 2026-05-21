import { describe, expect, it, vi } from "vitest";
import type { Agent, Run } from "../../cursor/types.js";
import { mountAgentDetail } from "../AgentDetail.js";

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
}

function createRootStub(): HTMLElement {
  const logEl = {
    textContent: "",
    scrollTop: 0,
    scrollHeight: 0
  };
  const form = {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    querySelector: vi.fn(() => null)
  };
  const backBtn = {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  };
  const cancelBtn = {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  };

  const root = {
    innerHTML: "",
    querySelector: vi.fn((selector: string) => {
      if (!root.innerHTML) {
        return null;
      }
      switch (selector) {
        case ".assistant-log":
          return logEl;
        case ".follow-up-form":
          return form;
        case ".btn-back":
          return backBtn;
        case ".btn-cancel":
          return cancelBtn;
        default:
          return null;
      }
    }),
    replaceChildren: vi.fn(() => {
      root.innerHTML = "";
    })
  };

  return root as unknown as HTMLElement;
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("mountAgentDetail", () => {
  it("does not render stale detail state after teardown", async () => {
    const latestRun: Run = {
      id: "run-1",
      agentId: "agent-1",
      status: "RUNNING",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    };
    const deferred = createDeferred<{ items: Run[] }>();
    const streamRun = vi.fn(async function* () {});
    const client = {
      listRuns: vi.fn(() => deferred.promise),
      streamRun,
      cancelRun: vi.fn(),
      createRun: vi.fn()
    };
    const glasses = {
      showAgentDetail: vi.fn(async () => {}),
      updateDetailDelta: vi.fn(async () => {})
    };
    const root = createRootStub();
    const teardown = mountAgentDetail({
      root,
      agent: {
        id: "agent-1",
        name: "Agent One",
        status: "RUNNING",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z"
      } satisfies Agent,
      client: client as never,
      glasses: glasses as never,
      onBack: vi.fn(),
      onAgentUpdated: vi.fn()
    });

    teardown();
    deferred.resolve({ items: [latestRun] });
    await flushPromises();

    expect(root.innerHTML).toBe("");
    expect(streamRun).not.toHaveBeenCalled();
    expect(glasses.showAgentDetail).not.toHaveBeenCalled();
  });
});
