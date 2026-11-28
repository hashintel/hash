import {
  getOrCreateBrunchConversationId,
  ordinaryConstructionConversationIdFrom,
  replaceBrunchConversationId,
} from "../../client/conversation/brunch-conversation-id";

import type { BrunchConversationPointer } from "../use-brunch-assistant";

/**
 * Which conversation `documentId` uses, kept in this browser's storage: the
 * pointer for a host that passes none. The document's first conversation
 * applies, and is stored, until Clear stores the one replacing it. It reads
 * the storage each time it is asked, and records nothing when a message is
 * sent.
 */
export const browserConversationPointer = (
  documentId: string,
): BrunchConversationPointer => {
  const initialId = ordinaryConstructionConversationIdFrom(documentId);
  return {
    get conversationId() {
      return getOrCreateBrunchConversationId(
        initialId,
        window.localStorage,
        () => initialId,
      );
    },
    start: () => {},
    replace: (conversationId) =>
      replaceBrunchConversationId(initialId, conversationId),
  };
};
