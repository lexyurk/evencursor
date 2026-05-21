import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { bridge, waitForEvenAppBridge } = vi.hoisted(() => {
  const bridge = {
    getLocalStorage: vi.fn<(key: string) => Promise<string>>(async () => ""),
    setLocalStorage: vi.fn<(key: string, value: string) => Promise<boolean>>(
      async () => false
    )
  };

  return {
    bridge,
    waitForEvenAppBridge: vi.fn(async () => bridge)
  };
});

vi.mock("@evenrealities/even_hub_sdk", () => ({
  waitForEvenAppBridge
}));

import { KeyStore } from "../storage.js";

type LocalStorageStub = {
  getItem: ReturnType<typeof vi.fn>;
  setItem: ReturnType<typeof vi.fn>;
  removeItem: ReturnType<typeof vi.fn>;
};

function createLocalStorageStub(): LocalStorageStub {
  const values = new Map<string, string>();

  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      values.delete(key);
    })
  };
}

describe("KeyStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("falls back to window.localStorage when the bridge probe fails", async () => {
    const localStorage = createLocalStorageStub();
    vi.stubGlobal("window", { localStorage });
    bridge.setLocalStorage.mockResolvedValue(false);
    bridge.getLocalStorage.mockResolvedValue("");

    const store = new KeyStore();

    await store.setKey("cursor.apiKey", "cur_test");

    expect(localStorage.setItem).toHaveBeenCalledWith("cursor.apiKey", "cur_test");
    await expect(store.getKey("cursor.apiKey")).resolves.toBe("cur_test");
    expect(bridge.setLocalStorage).toHaveBeenCalledTimes(1);
  });

  it("uses the bridge when the probe round-trip succeeds", async () => {
    const localStorage = createLocalStorageStub();
    vi.stubGlobal("window", { localStorage });

    const bridgeValues = new Map<string, string>();
    bridge.setLocalStorage.mockImplementation(async (key: string, value: string) => {
      bridgeValues.set(key, value);
      return true;
    });
    bridge.getLocalStorage.mockImplementation(async (key: string) => {
      return bridgeValues.get(key) ?? "";
    });

    const store = new KeyStore();

    await store.setKey("cursor.apiKey", "cur_bridge");

    expect(localStorage.setItem).not.toHaveBeenCalled();
    await expect(store.getKey("cursor.apiKey")).resolves.toBe("cur_bridge");
    expect(bridge.getLocalStorage).toHaveBeenCalledWith("cursor.apiKey");
  });
});
