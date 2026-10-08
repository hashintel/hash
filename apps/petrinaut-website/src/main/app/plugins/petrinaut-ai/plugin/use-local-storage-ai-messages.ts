import { toPetrinautId } from "@hashintel/petrinaut-core";

import {
  readBrowserStorage,
  writeBrowserStorage,
} from "../../../local-storage-demo/browser-storage";
import { usePersistedState } from "../../../local-storage-demo/use-persisted-state";

import type { PetrinautAiMessage } from "@hashintel/petrinaut/ui";

const rootLocalStorageKey = "petrinaut-ai-messages";

type AiMessagesByNetId = Record<string, PetrinautAiMessage[]>;
const noAiMessages: AiMessagesByNetId = {};

/**
 * Keys every conversation by net id, so history saved under a legacy id
 * follows the converted net. An entry already keyed by its net id wins.
 */
const keyedByNetId = (
  entries: [string, PetrinautAiMessage[]][],
): AiMessagesByNetId => {
  const canonical = new Map<string, PetrinautAiMessage[]>();
  for (const [key, messages] of entries) {
    const netId = toPetrinautId(key);
    if (key === netId || !canonical.has(netId)) {
      canonical.set(netId, messages);
    }
  }
  return Object.fromEntries(canonical);
};

const readMessages = (): AiMessagesByNetId => {
  const stored = readBrowserStorage(localStorage, rootLocalStorageKey);
  if (stored === null) return {};
  try {
    const parsed: unknown = JSON.parse(stored);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return {};
    }
    const entries = Object.entries(parsed);
    if (
      !entries.every(
        ([netId, messages]) =>
          netId.length > 0 &&
          Array.isArray(messages) &&
          messages.every(
            (message: unknown) =>
              typeof message === "object" &&
              message !== null &&
              "id" in message &&
              typeof message.id === "string" &&
              "role" in message &&
              (message.role === "user" ||
                message.role === "assistant" ||
                message.role === "system") &&
              "parts" in message &&
              Array.isArray(message.parts) &&
              message.parts.every(
                (part: unknown) =>
                  typeof part === "object" &&
                  part !== null &&
                  "type" in part &&
                  typeof part.type === "string",
              ),
          ),
      )
    ) {
      return {};
    }
    return keyedByNetId(entries as [string, PetrinautAiMessage[]][]);
  } catch {
    return {};
  }
};

const writeMessages = (messages: AiMessagesByNetId): void =>
  writeBrowserStorage(
    localStorage,
    rootLocalStorageKey,
    JSON.stringify(messages),
  );

export const useLocalStorageAiMessages = () => {
  const [aiMessagesByNetId, setAiMessagesByNetId] = usePersistedState({
    fallback: noAiMessages,
    read: readMessages,
    storageKey: rootLocalStorageKey,
    write: writeMessages,
  });
  return { aiMessagesByNetId, setAiMessagesByNetId };
};
