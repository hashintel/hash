import {
  readBrowserStorage,
  writeBrowserStorage,
} from "../../../local-storage-demo/browser-storage";
import { usePersistedState } from "../../../local-storage-demo/use-persisted-state";

import type { PetrinautAiMessage } from "@hashintel/petrinaut/ui";

const rootLocalStorageKey = "petrinaut-ai-messages";

type AiMessagesByNetId = Record<string, PetrinautAiMessage[]>;
const noAiMessages: AiMessagesByNetId = {};

const isAiMessage = (message: unknown): message is PetrinautAiMessage =>
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
  );

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
          messages.every(isAiMessage),
      )
    ) {
      return {};
    }

    return Object.fromEntries(entries) as AiMessagesByNetId;
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

/**
 * The saved transcript of one document and how to replace or clear it. Every
 * document's transcript lives under one storage key, so a write keeps the
 * other documents' transcripts.
 */
export const useLocalStorageAiMessages = (
  documentId: string,
): readonly [
  PetrinautAiMessage[] | undefined,
  (messages: PetrinautAiMessage[] | undefined) => void,
] => {
  const [aiMessagesByNetId, setAiMessagesByNetId] = usePersistedState({
    fallback: noAiMessages,
    read: readMessages,
    storageKey: rootLocalStorageKey,
    write: writeMessages,
  });
  const setMessages = (messages: PetrinautAiMessage[] | undefined) =>
    setAiMessagesByNetId((previous) => {
      const next = { ...previous };
      if (messages === undefined) delete next[documentId];
      else next[documentId] = messages;

      return next;
    });

  return [aiMessagesByNetId[documentId], setMessages];
};
