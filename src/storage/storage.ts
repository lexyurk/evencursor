import { waitForEvenAppBridge } from "@evenrealities/even_hub_sdk";

const BRIDGE_TIMEOUT_MS = 500;
const BRIDGE_PROBE_KEY_PREFIX = "__evencursor.bridge_probe__";

type EvenBridge = NonNullable<Awaited<ReturnType<typeof waitForEvenAppBridge>>>;

async function withBridgeTimeout(): Promise<
  Awaited<ReturnType<typeof waitForEvenAppBridge>> | undefined
> {
  try {
    return await Promise.race([
      waitForEvenAppBridge(),
      new Promise<undefined>((resolve) =>
        setTimeout(() => resolve(undefined), BRIDGE_TIMEOUT_MS)
      )
    ]);
  } catch {
    return undefined;
  }
}

async function withFunctionalBridge(): Promise<EvenBridge | undefined> {
  const bridge = await withBridgeTimeout();
  if (!bridge) {
    return undefined;
  }

  const probeKey = `${BRIDGE_PROBE_KEY_PREFIX}.${Math.random().toString(36).slice(2)}`;
  const probeValue = `${Date.now()}`;

  try {
    const stored = await bridge.setLocalStorage(probeKey, probeValue);
    if (!stored) {
      return undefined;
    }

    const roundTrip = await bridge.getLocalStorage(probeKey);
    if (roundTrip !== probeValue) {
      return undefined;
    }

    try {
      await bridge.setLocalStorage(probeKey, "");
    } catch {
      // Ignore cleanup failures once the probe confirms the bridge works.
    }

    return bridge;
  } catch {
    return undefined;
  }
}

export class KeyStore {
  private bridgePromise: ReturnType<typeof withFunctionalBridge> | undefined;

  private bridge(): ReturnType<typeof withFunctionalBridge> {
    this.bridgePromise ??= withFunctionalBridge();
    return this.bridgePromise;
  }

  async getKey(name: string): Promise<string | undefined> {
    const bridge = await this.bridge();
    if (bridge) {
      const value = await bridge.getLocalStorage(name);
      return value.length > 0 ? value : undefined;
    }
    const raw = window.localStorage.getItem(name);
    return raw && raw.length > 0 ? raw : undefined;
  }

  async setKey(name: string, value: string | undefined): Promise<void> {
    const bridge = await this.bridge();
    const stored = value ?? "";
    if (bridge) {
      await bridge.setLocalStorage(name, stored);
      return;
    }
    if (value === undefined || value === "") {
      window.localStorage.removeItem(name);
    } else {
      window.localStorage.setItem(name, value);
    }
  }
}
