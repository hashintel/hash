import type { PetrinautAiMessage } from "../../shared/messages";

/**
 * `localStorage`-backed persistence for Petrinaut AI-assistant conversations,
 * keyed by net. Lives on the host (`process-editor`) because the Petrinaut
 * editor runs inside a sandboxed null-origin iframe whose opaque origin has no
 * usable `localStorage`; the iframe relays conversation updates over the
 * postMessage bridge and the host reads/writes here.
 */
const ROOT_STORAGE_KEY = "petrinaut-ai-messages";

type StoredMessagesByNetKey = Record<string, PetrinautAiMessage[]>;

const readStore = (): StoredMessagesByNetKey => {
  if (typeof window === "undefined") {
    return {};
  }
  try {
    const raw = window.localStorage.getItem(ROOT_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as unknown;
    return typeof parsed === "object" && parsed !== null
      ? (parsed as StoredMessagesByNetKey)
      : {};
  } catch {
    // Corrupt JSON or a `localStorage` that throws (privacy mode, quota).
    // Treat as empty rather than crashing the editor.
    return {};
  }
};

const writeStore = (store: StoredMessagesByNetKey): void => {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(ROOT_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Quota exceeded / serialisation failure — persistence is best-effort.
  }
};

export const readAiMessages = (netKey: string): PetrinautAiMessage[] =>
  readStore()[netKey] ?? [];

/**
 * Persists `messages` under `netKey`. An empty array deletes the entry so the
 * store doesn't accumulate empty conversations.
 */
export const writeAiMessages = (
  netKey: string,
  messages: PetrinautAiMessage[],
): void => {
  const store = readStore();
  if (messages.length === 0) {
    delete store[netKey];
  } else {
    store[netKey] = messages;
  }
  writeStore(store);
};

export const clearAiMessages = (netKey: string): void => {
  const store = readStore();
  if (!(netKey in store)) {
    return;
  }
  delete store[netKey];
  writeStore(store);
};
