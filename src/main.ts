import {
  bindKeyStore,
  getCursorApiKey,
  getDeepgramApiKey
} from "./cursor/auth.js";
import { GlassesAdapter } from "./glasses/adapter.js";
import { mountSimulator } from "./sim/Simulator.js";
import { KeyStore } from "./storage/storage.js";
import { mountApp } from "./ui/App.js";
import { mountSignIn } from "./ui/SignIn.js";
import "./ui/styles.css";

export async function bootIntoRoot(root: HTMLElement): Promise<() => void> {
  const keyStore = new KeyStore();
  bindKeyStore(keyStore);

  const glasses = new GlassesAdapter();
  await glasses.init();

  let teardown: (() => void) | undefined;

  const showSignIn = (): void => {
    teardown?.();
    teardown = mountSignIn({
      root,
      keyStore,
      onSignedIn: () => {
        showApp();
      }
    });
  };

  const showApp = (): void => {
    teardown?.();
    teardown = mountApp({
      root,
      keyStore,
      glasses,
      onSignOut: () => {
        showSignIn();
      }
    });
  };

  const cursorKey = await getCursorApiKey();
  const deepgramKey = await getDeepgramApiKey();
  if (cursorKey && deepgramKey) {
    showApp();
  } else {
    showSignIn();
  }

  return () => {
    teardown?.();
    root.replaceChildren();
  };
}

async function main(): Promise<void> {
  const root = document.getElementById("app");
  if (!root) {
    throw new Error("#app element not found");
  }

  const hash = window.location.hash.replace(/^#/, "");
  if (hash === "/simulator") {
    mountSimulator(root);
    return;
  }

  await bootIntoRoot(root);
}

void main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  const root = document.getElementById("app");
  if (root) {
    root.textContent = `Failed to start: ${message}`;
  }
  console.error(err);
});
