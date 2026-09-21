import { BRUNCH_CONVERSATION_HEADER, BRUNCH_PRINCIPAL_HEADER } from "./headers";

export interface ConversationIdentity {
  readonly conversationId: string;
  readonly principalKey: string;
}

export const identityPayload = ({
  principalKey,
  conversationId,
}: ConversationIdentity): Uint8Array => {
  const encoder = new TextEncoder();
  const principalBytes = encoder.encode(principalKey);
  const conversationBytes = encoder.encode(conversationId);
  const payload = new Uint8Array(
    principalBytes.length + 1 + conversationBytes.length,
  );
  payload.set(principalBytes, 0);
  payload[principalBytes.length] = 0;
  payload.set(conversationBytes, principalBytes.length + 1);
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

/**
 * Bound one browser continuation identity independently of batch size. Outputs
 * stay out of this digest so Flue can reject changed content under the same
 * logical submission key.
 */
export const clientToolResultIdempotencyKey = async (
  assistantMessageId: string,
  toolCallIds: readonly string[],
): Promise<string> => {
  const logicalIdentity = JSON.stringify([
    assistantMessageId,
    [...toolCallIds].sort(),
  ]);
  const digest = await sha256Hex(new TextEncoder().encode(logicalIdentity));
  return `ai-sdk:client-tools:sha256:${digest}`;
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
  [BRUNCH_PRINCIPAL_HEADER]: identity.principalKey,
  [BRUNCH_CONVERSATION_HEADER]: identity.conversationId,
});
