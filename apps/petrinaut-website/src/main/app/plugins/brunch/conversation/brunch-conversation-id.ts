const conversationStorageKey = "brunch-conversation-id-v1";

/** Net-scoped Flue conversation for ordinary configured Brunch. */
const ordinaryConstructionConversationIdPrefix = "brunch-construction-v1";

export const ordinaryConstructionConversationIdFrom = (netId: string): string =>
  `${ordinaryConstructionConversationIdPrefix}:${netId}`;

/** Preserve the `evaluation-I` conversation namespace for existing local history. */
export const brunchEvaluationConversationIdFrom = (
  conversationId: string,
): string => `${conversationId}:evaluation-I`;

interface ConversationStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * Each document's current conversation, keyed by its initial conversation id.
 * A broken pointer cache reads as empty, so a new conversation can start.
 */
const readPointers = (storage: ConversationStorage): Record<string, string> => {
  try {
    return JSON.parse(
      storage.getItem(conversationStorageKey) ?? "{}",
    ) as Record<string, string>;
  } catch {
    return {};
  }
};

/** Change only the pointer; old conversation history and the model are retained. */
export const replaceBrunchConversationId = (
  initialConversationId: string,
  conversationId: string,
  storage: ConversationStorage = window.localStorage,
): void => {
  try {
    storage.setItem(
      conversationStorageKey,
      JSON.stringify({
        ...readPointers(storage),
        [initialConversationId]: conversationId,
      }),
    );
  } catch {
    // The host retains the new id for this page load.
  }
};

/** The conversation a cleared chat moved to, if the pointer names one. */
export const storedBrunchConversationId = (
  initialConversationId: string,
  storage: ConversationStorage = window.localStorage,
): string | undefined => {
  const existing = readPointers(storage)[initialConversationId];
  return typeof existing === "string" && existing.length > 0
    ? existing
    : undefined;
};
