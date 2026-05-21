// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BRIDGE_PROBE_KEY, BRIDGE_PROBE_VALUE } from "../bridge-probe.js";

const { bridge, bridgeStorage, waitForEvenAppBridge } = vi.hoisted(() => {
  const bridgeStorage = new Map<string, string>();

  const bridge = {
    setLocalStorage: vi.fn(async (key: string, value: string) => {
      bridgeStorage.set(key, value);
      return true;
    }),
    getLocalStorage: vi.fn(async (key: string) => bridgeStorage.get(key) ?? "")
  };

  return {
    bridge,
    bridgeStorage,
    waitForEvenAppBridge: vi.fn(async () => bridge)
  };
});

vi.mock("@evenrealities/even_hub_sdk", () => ({
  waitForEvenAppBridge
}));

import { resetBridgeProbeCacheForTests } from "../bridge-probe.js";
import { KeyStore } from "../storage.js";

describe("KeyStore", () => {
  beforeEach(() => {
    localStorage.clear();
    bridgeStorage.clear();
    vi.clearAllMocks();
    resetBridgeProbeCacheForTests();
    waitForEvenAppBridge.mockResolvedValue(bridge);
    bridge.setLocalStorage.mockImplementation(async (key: string, value: string) => {
      bridgeStorage.set(key, value);
      return true;
    });
    bridge.getLocalStorage.mockImplementation(
      async (key: string) => bridgeStorage.get(key) ?? ""
    );
  });

  afterEach(() => {
    resetBridgeProbeCacheForTests();
  });

  it("persists via bridge and mirrors to localStorage when probe succeeds", async () => {
    const store = new KeyStore();
    await store.setKey("cursor.apiKey", "cursor-secret");

    expect(bridge.setLocalStorage).toHaveBeenCalledWith(
      BRIDGE_PROBE_KEY,
      BRIDGE_PROBE_VALUE
    );
    expect(bridge.setLocalStorage).toHaveBeenCalledWith(
      "cursor.apiKey",
      "cursor-secret"
    );
    expect(localStorage.getItem("cursor.apiKey")).toBe("cursor-secret");
    expect(await store.getKey("cursor.apiKey")).toBe("cursor-secret");
  });

  it("falls back to localStorage when setLocalStorage returns false", async () => {
    bridge.setLocalStorage.mockImplementation(async (key: string, value: string) => {
      if (key === BRIDGE_PROBE_KEY) {
        return false;
      }
      bridgeStorage.set(key, value);
      return true;
    });

    const store = new KeyStore();
    await store.setKey("cursor.apiKey", "browser-only");

    expect(localStorage.getItem("cursor.apiKey")).toBe("browser-only");
    expect(await store.getKey("cursor.apiKey")).toBe("browser-only");
  });

  it("falls back to localStorage when probe readback is empty", async () => {
    bridge.setLocalStorage.mockResolvedValue(true);
    bridge.getLocalStorage.mockResolvedValue("");

    const store = new KeyStore();
    await store.setKey("cursor.apiKey", "browser-only");

    expect(localStorage.getItem("cursor.apiKey")).toBe("browser-only");
    expect(await store.getKey("cursor.apiKey")).toBe("browser-only");
  });

  it("reads bridge first and falls back to localStorage when bridge is empty", async () => {
    localStorage.setItem("cursor.apiKey", "local-fallback");

    const store = new KeyStore();
    expect(await store.getKey("cursor.apiKey")).toBe("local-fallback");
    expect(bridge.getLocalStorage).toHaveBeenCalledWith("cursor.apiKey");
  });

  it("clears both layers when deleting a key", async () => {
    const store = new KeyStore();
    await store.setKey("cursor.apiKey", "cursor-secret");
    await store.setKey("cursor.apiKey", undefined);

    expect(localStorage.getItem("cursor.apiKey")).toBeNull();
    expect(await store.getKey("cursor.apiKey")).toBeUndefined();
    expect(bridge.setLocalStorage).toHaveBeenCalledWith("cursor.apiKey", "");
  });

  it("uses pure localStorage when no bridge is present", async () => {
    vi.useFakeTimers();
    waitForEvenAppBridge.mockImplementation(() => new Promise(() => {}));

    const store = new KeyStore();
    const setPromise = store.setKey("cursor.apiKey", "browser-only");
    await vi.advanceTimersByTimeAsync(500);
    await setPromise;

    expect(localStorage.getItem("cursor.apiKey")).toBe("browser-only");
    expect(await store.getKey("cursor.apiKey")).toBe("browser-only");
    vi.useRealTimers();
  });
});
