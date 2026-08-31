/** Browser-safe instance-id hash; must match `flueConversationId` byte-for-byte. */

import { hexFromDigest, identityPayload } from "./conversation-payload.ts";

export const flueConversationIdWeb = async (
  principalKey: string,
  conversationId: string,
): Promise<string> => {
  const payload = identityPayload(principalKey, conversationId);
  const bytes = new ArrayBuffer(payload.byteLength);
  new Uint8Array(bytes).set(payload);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return hexFromDigest(digest);
};
