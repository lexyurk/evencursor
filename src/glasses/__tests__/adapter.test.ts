import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DETAIL_STATUS_CONTAINER_ID,
  DETAIL_STATUS_CONTAINER_NAME
} from "../pages.js";

const { bridge, waitForEvenAppBridge } = vi.hoisted(() => {
  const bridge = {
    createStartUpPageContainer: vi.fn(async () => 0),
    rebuildPageContainer: vi.fn(async () => true),
    textContainerUpgrade: vi.fn(async () => true),
    onEvenHubEvent: vi.fn(() => () => {}),
    audioControl: vi.fn(async () => true),
    shutDownPageContainer: vi.fn(async () => true)
  };

  return {
    bridge,
    waitForEvenAppBridge: vi.fn(async () => bridge)
  };
});

vi.mock("@evenrealities/even_hub_sdk", async () => {
  const actual = await vi.importActual<typeof import("@evenrealities/even_hub_sdk")>(
    "@evenrealities/even_hub_sdk"
  );
  return {
    ...actual,
    waitForEvenAppBridge
  };
});

import { GlassesAdapter } from "../adapter.js";

describe("GlassesAdapter", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout
    });
    vi.clearAllMocks();
    waitForEvenAppBridge.mockResolvedValue(bridge);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("no-ops when the bridge is missing", async () => {
    vi.useFakeTimers();
    waitForEvenAppBridge.mockImplementation(
      () => new Promise(() => {})
    );
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});

    const adapter = new GlassesAdapter();
    const initPromise = adapter.init();
    await vi.advanceTimersByTimeAsync(500);
    const { available } = await initPromise;
    vi.useRealTimers();

    expect(available).toBe(false);

    await adapter.showAgentList(["RUNNING  one"], "1 agents · tap to select");
    await adapter.showAgentDetail({
      title: "one",
      statusLine: "RUNNING",
      lastDelta: "hello",
      footer: "Swipe up: back · Press: follow up"
    });
    await adapter.updateDetailDelta("world");
    adapter.onSelection(() => {});
    await adapter.openMic(() => {});
    await adapter.shutdown();

    expect(bridge.createStartUpPageContainer).not.toHaveBeenCalled();
    expect(bridge.rebuildPageContainer).not.toHaveBeenCalled();
    expect(bridge.textContainerUpgrade).not.toHaveBeenCalled();
    expect(debugSpy).toHaveBeenCalledWith(
      "[glasses no-op]",
      "showAgentList",
      ["RUNNING  one"],
      "1 agents · tap to select"
    );

    debugSpy.mockRestore();
  });

  it("uses createStartUpPageContainer first and rebuildPageContainer second", async () => {
    const adapter = new GlassesAdapter();
    await adapter.init();

    await adapter.showAgentList(["RUNNING  one"], "1 agents · tap to select");
    await adapter.showAgentList(["RUNNING  two"], "1 agents · tap to select");

    expect(bridge.createStartUpPageContainer).toHaveBeenCalledTimes(1);
    expect(bridge.rebuildPageContainer).toHaveBeenCalledTimes(1);
  });

  it("updates the middle detail container via textContainerUpgrade", async () => {
    const adapter = new GlassesAdapter();
    await adapter.init();

    await adapter.showAgentDetail({
      title: "one",
      statusLine: "RUNNING · run abc",
      lastDelta: "first",
      footer: "Swipe up: back · Press: follow up"
    });
    await adapter.updateDetailDelta("second line");

    expect(bridge.textContainerUpgrade).toHaveBeenCalledTimes(1);
    expect(bridge.textContainerUpgrade).toHaveBeenCalledWith(
      expect.objectContaining({
        containerID: DETAIL_STATUS_CONTAINER_ID,
        containerName: DETAIL_STATUS_CONTAINER_NAME,
        content: "RUNNING · run abc\nsecond line"
      })
    );
  });
});
