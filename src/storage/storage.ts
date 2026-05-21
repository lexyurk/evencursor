import type { EvenAppBridge } from "@evenrealities/even_hub_sdk";
import { getBridgeIfAvailable, isEvenHubAvailable } from "./bridge-probe.js";

export { isEvenHubAvailable };

export class KeyStore {
  private availableBridgePromise: Promise<EvenAppBridge | null> | undefined;

  private bridge(): Promise<EvenAppBridge | null> {
    this.availableBridgePromise ??= getBridgeIfAvailable();
    return this.availableBridgePromise;
  }

  async getKey(name: string): Promise<string | undefined> {
    const bridge = await this.bridge();
    if (bridge) {
      const value = await bridge.getLocalStorage(name);
      if (value.length > 0) {
        return value;
      }
    }
    const raw = window.localStorage.getItem(name);
    return raw && raw.length > 0 ? raw : undefined;
  }

  async setKey(name: string, value: string | undefined): Promise<void> {
    const bridge = await this.bridge();

    if (value === undefined || value === "") {
      window.localStorage.removeItem(name);
      if (bridge) {
        await bridge.setLocalStorage(name, "");
      }
      return;
    }

    window.localStorage.setItem(name, value);
    if (bridge) {
      await bridge.setLocalStorage(name, value);
    }
  }
}
