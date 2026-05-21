import type { GlassesAdapter } from "../glasses/adapter.js";
import type { KeyStore } from "../storage/storage.js";

export type AppDeps = {
  root: HTMLElement;
  keyStore: KeyStore;
  glasses: GlassesAdapter;
};

export function mountApp(_deps: AppDeps): () => void {
  throw new Error("not implemented: mountApp");
}
