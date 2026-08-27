/** Stable Flue instance id for one principal + panel conversation. */

import { createHash } from "node:crypto";

export const flueConversationId = (
  principalKey: string,
  conversationId: string,
): string =>
  createHash("sha256")
    .update(principalKey)
    .update("\0")
    .update(conversationId)
    .digest("hex");
