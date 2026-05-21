import {
  bindKeyStore,
  getCursorApiKey,
  getDeepgramApiKey
} from "../cursor/auth.js";
import { GlassesAdapter } from "../glasses/adapter.js";
import { resetBridgeProbeCacheForTests } from "../storage/bridge-probe.js";
import { KeyStore } from "../storage/storage.js";
import { mountApp } from "../ui/App.js";
import { mountSignIn } from "../ui/SignIn.js";
import "../ui/styles.css";
import { describeG2Page } from "./g2-canvas.js";
import {
  installSimBridgeGlobal,
  SimulatorBridge,
  type ListEventPayload
} from "./simulator-bridge.js";

export function mountSimulator(root: HTMLElement): () => void {
  root.innerHTML = `
    <div class="simulator-layout">
      <header class="simulator-header">
        <h1>G2 Simulator</h1>
        <a class="simulator-link" href="#/" target="_blank" rel="noopener">Open phone app</a>
      </header>
      <div class="simulator-main">
        <section class="sim-panel sim-canvas-panel">
          <h2>G2 HUD</h2>
          <canvas class="sim-g2-canvas" width="1152" height="576" aria-label="G2 display"></canvas>
        </section>
        <section class="sim-panel sim-touchpad-panel">
          <h2>Touchpad</h2>
          <div class="sim-touchpad">
            <button type="button" data-action="up">Up</button>
            <button type="button" data-action="down">Down</button>
            <button type="button" data-action="press">Press</button>
            <button type="button" data-action="back">Back</button>
            <button type="button" data-action="swipe-up">Swipe Up</button>
            <button type="button" data-action="swipe-down">Swipe Down</button>
          </div>
        </section>
        <section class="sim-panel sim-status-panel">
          <h2>Status</h2>
          <pre class="sim-status-log"></pre>
        </section>
      </div>
      <section class="sim-phone-panel">
        <h2>Phone</h2>
        <div id="sim-phone-app" class="sim-phone-app"></div>
      </section>
    </div>
  `;

  const canvas = root.querySelector<HTMLCanvasElement>(".sim-g2-canvas");
  const statusLog = root.querySelector<HTMLElement>(".sim-status-log");
  const phoneRoot = root.querySelector<HTMLElement>("#sim-phone-app");

  if (!canvas || !phoneRoot) {
    throw new Error("Simulator layout failed to mount");
  }

  const bridge = new SimulatorBridge(canvas);
  installSimBridgeGlobal(bridge);
  resetBridgeProbeCacheForTests();
  void bridge.probeStorage();

  const writeStatus = (): void => {
    if (!statusLog || !bridge) {
      return;
    }
    const page = bridge.getCurrentPage();
    if (!page) {
      statusLog.textContent = "Page: idle";
      return;
    }
    const info = describeG2Page(page);
    statusLog.textContent = [
      `Page: ${info.kind}`,
      `Selected: ${bridge.selectedIndex}`,
      `Rows:`,
      ...info.rows.map((row, index) => `  ${index + 1}. ${row}`),
      `Footer: ${info.footer || "—"}`
    ].join("\n");
  };

  const unsubPage = bridge.onPageChanged(() => {
    writeStatus();
  });
  writeStatus();

  const dispatch = (payload: ListEventPayload): void => {
    bridge.dispatchListEvent(payload);
  };

  root.querySelectorAll<HTMLButtonElement>("[data-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const action = button.dataset.action;
      switch (action) {
        case "up":
          bridge.moveSelection(-1);
          writeStatus();
          break;
        case "down":
          bridge.moveSelection(1);
          writeStatus();
          break;
        case "press":
          bridge.pressSelect();
          break;
        case "back":
          dispatch({
            currentSelectItemIndex: -1,
            currentSelectItemName: "",
            evenHubEvent: "BACK"
          });
          break;
        case "swipe-up":
          dispatch({
            currentSelectItemIndex: bridge.selectedIndex,
            currentSelectItemName: "",
            evenHubEvent: "SWIPE_UP"
          });
          break;
        case "swipe-down":
          dispatch({
            currentSelectItemIndex: bridge.selectedIndex,
            currentSelectItemName: "",
            evenHubEvent: "SWIPE_DOWN"
          });
          break;
        default:
          break;
      }
    });
  });

  const keyStore = new KeyStore();
  bindKeyStore(keyStore);
  const glasses = new GlassesAdapter();

  let phoneTeardown: (() => void) | undefined;

  const showPhoneSignIn = (): void => {
    phoneTeardown?.();
    phoneTeardown = mountSignIn({
      root: phoneRoot,
      keyStore,
      onSignedIn: () => {
        showPhoneApp();
      }
    });
  };

  const showPhoneApp = (): void => {
    phoneTeardown?.();
    phoneTeardown = mountApp({
      root: phoneRoot,
      keyStore,
      glasses,
      onSignOut: () => {
        showPhoneSignIn();
      }
    });
  };

  void (async () => {
    await glasses.init();
    const cursorKey = await getCursorApiKey();
    const deepgramKey = await getDeepgramApiKey();
    if (cursorKey && deepgramKey) {
      showPhoneApp();
    } else {
      showPhoneSignIn();
    }
  })();

  return () => {
    unsubPage();
    phoneTeardown?.();
    root.replaceChildren();
  };
}
