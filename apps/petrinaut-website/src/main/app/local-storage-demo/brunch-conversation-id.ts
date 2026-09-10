const conversationStorageKey = "brunch-conversation-id-v1";

/** Incarnation-scoped Flue conversation for ordinary configured Brunch. */
export const ordinaryConstructionConversationIdPrefix =
  "brunch-construction-v1";

export const ordinaryConstructionConversationIdFrom = (
  incarnationId: string,
): string => `${ordinaryConstructionConversationIdPrefix}:${incarnationId}`;

interface ConversationStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const getOrCreateBrunchConversationId = (
  netId: string,
  storage: ConversationStorage = window.localStorage,
  createId: () => string = () => crypto.randomUUID(),
): string => {
  let stored: Record<string, string> = {};
  try {
    const raw = storage.getItem(conversationStorageKey);
    stored = raw === null ? {} : (JSON.parse(raw) as Record<string, string>);
  } catch {
    stored = {};
  }
  const existing = stored[netId];
  if (typeof existing === "string" && existing.length > 0) {
    return existing;
  }
  const conversationId = createId();
  storage.setItem(
    conversationStorageKey,
    JSON.stringify({ ...stored, [netId]: conversationId }),
  );
  return conversationId;
};
