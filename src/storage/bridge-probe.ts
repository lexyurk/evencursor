import {
  waitForEvenAppBridge,
  type EvenAppBridge
} from "@evenrealities/even_hub_sdk";

export const BRIDGE_TIMEOUT_MS = 500;
export const BRIDGE_PROBE_KEY = "evencursor.bridge-probe";
export const BRIDGE_PROBE_VALUE = "ok";

let bridgeAvailabilityPromise: Promise<EvenAppBridge | null> | undefined;

async function withBridgeTimeout(): Promise<EvenAppBridge | undefined> {
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

export async function probeStorageBridge(
  bridge: EvenAppBridge
): Promise<boolean> {
  try {
    const setOk = await bridge.setLocalStorage(
      BRIDGE_PROBE_KEY,
      BRIDGE_PROBE_VALUE
    );
    if (!setOk) {
      return false;
    }
    const readback = await bridge.getLocalStorage(BRIDGE_PROBE_KEY);
    return readback === BRIDGE_PROBE_VALUE;
  } catch {
    return false;
  }
}

async function resolveBridgeIfAvailable(): Promise<EvenAppBridge | null> {
  const bridge = await withBridgeTimeout();
  if (!bridge) {
    return null;
  }
  const ok = await probeStorageBridge(bridge);
  return ok ? bridge : null;
}

export function getBridgeIfAvailable(): Promise<EvenAppBridge | null> {
  bridgeAvailabilityPromise ??= resolveBridgeIfAvailable();
  return bridgeAvailabilityPromise;
}

export async function isEvenHubAvailable(): Promise<boolean> {
  return (await getBridgeIfAvailable()) !== null;
}

export function resetBridgeProbeCacheForTests(): void {
  bridgeAvailabilityPromise = undefined;
}
