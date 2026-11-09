import { brunchHeaders } from "./constants";

export interface ConversationIdentity {
  readonly conversationId: string;
  readonly ownerKey: string;
}

export const identityPayload = ({
  ownerKey,
  conversationId,
}: ConversationIdentity): Uint8Array => {
  const encoder = new TextEncoder();
  const ownerKeyBytes = encoder.encode(ownerKey);
  const conversationBytes = encoder.encode(conversationId);
  const payload = new Uint8Array(
    ownerKeyBytes.length + 1 + conversationBytes.length,
  );
  payload.set(ownerKeyBytes, 0);
  payload[ownerKeyBytes.length] = 0;
  payload.set(conversationBytes, ownerKeyBytes.length + 1);
  return payload;
};

const hexFromDigest = (digest: ArrayBuffer): string =>
  [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

const sha256Hex = async (payload: Uint8Array): Promise<string> => {
  const bytes = new ArrayBuffer(payload.byteLength);
  new Uint8Array(bytes).set(payload);
  return hexFromDigest(await globalThis.crypto.subtle.digest("SHA-256", bytes));
};

/** Browser-safe counterpart to the server's synchronous instance-id hash. */
export const flueConversationIdWeb = async (
  identity: ConversationIdentity,
): Promise<string> => {
  return sha256Hex(identityPayload(identity));
};

export const agentOwnershipHeaders = (
  identity: ConversationIdentity,
): Record<string, string> => ({
  [brunchHeaders.ownerKey]: identity.ownerKey,
  [brunchHeaders.conversation]: identity.conversationId,
});
