import type { KeyStore } from "../storage/storage.js";

export type SignInDeps = {
  root: HTMLElement;
  keyStore: KeyStore;
  onSignedIn: () => void;
};

export function mountSignIn(_deps: SignInDeps): () => void {
  throw new Error("not implemented: mountSignIn");
}
