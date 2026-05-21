import { waitForEvenAppBridge } from "@evenrealities/even_hub_sdk";

const BRIDGE_TIMEOUT_MS = 500;

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

export class KeyStore {
  private bridgePromise: ReturnType<typeof withBridgeTimeout> | undefined;

  private bridge(): ReturnType<typeof withBridgeTimeout> {
    this.bridgePromise ??= withBridgeTimeout();
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
