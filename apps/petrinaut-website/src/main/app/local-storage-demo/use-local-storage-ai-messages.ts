import { readBrowserStorage, writeBrowserStorage } from "./browser-storage";
import { usePersistedState } from "./use-persisted-state";

import type { PetrinautAiMessage } from "@hashintel/petrinaut/ui";

const rootLocalStorageKey = "petrinaut-ai-messages";

type AiMessagesByNetId = Record<string, PetrinautAiMessage[]>;
const noAiMessages: AiMessagesByNetId = {};

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

export const useLocalStorageAiMessages = (input?: {
  readonly enabled: boolean;
}) => {
  const enabled = input?.enabled ?? true;
  const [aiMessagesByNetId, setAiMessagesByNetId] = usePersistedState({
    enabled,
    fallback: noAiMessages,
    read: readMessages,
    write: writeMessages,
  });
  return { aiMessagesByNetId, setAiMessagesByNetId };
};
