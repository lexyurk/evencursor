import type { KeyStore } from "../storage/storage.js";

export const CURSOR_API_KEY_NAME = "cursor.apiKey";
export const DEEPGRAM_API_KEY_NAME = "deepgram.apiKey";

let store: KeyStore | undefined;

export function bindKeyStore(keyStore: KeyStore): void {
  store = keyStore;
}

function requireStore(): KeyStore {
  if (!store) {
    throw new Error("KeyStore not bound; call bindKeyStore first");
  }
  return store;
}

export function basicAuthHeader(apiKey: string): string {
  return `Basic ${btoa(`${apiKey}:`)}`;
}

export async function getCursorApiKey(): Promise<string | undefined> {
  return requireStore().getKey(CURSOR_API_KEY_NAME);
}

export async function setCursorApiKey(value: string | undefined): Promise<void> {
  await requireStore().setKey(CURSOR_API_KEY_NAME, value);
}

export async function getDeepgramApiKey(): Promise<string | undefined> {
  return requireStore().getKey(DEEPGRAM_API_KEY_NAME);
}

export async function setDeepgramApiKey(value: string | undefined): Promise<void> {
  await requireStore().setKey(DEEPGRAM_API_KEY_NAME, value);
}
