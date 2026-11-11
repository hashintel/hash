import { brunchHeaders } from "./constants";

export interface ConversationIdentity {
  readonly conversationId: string;
  /** Who acts in the conversation; with its ID, names the conversation's instance. */
  readonly actorKey: string;
}

export const identityPayload = ({
  actorKey,
  conversationId,
}: ConversationIdentity): Uint8Array => {
  const encoder = new TextEncoder();
  const actorKeyBytes = encoder.encode(actorKey);
  const conversationBytes = encoder.encode(conversationId);
  const payload = new Uint8Array(
    actorKeyBytes.length + 1 + conversationBytes.length,
  );
  payload.set(actorKeyBytes, 0);
  payload[actorKeyBytes.length] = 0;
  payload.set(conversationBytes, actorKeyBytes.length + 1);
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

/** How a client names the actor on the wire. */
export interface ActorHeaderOptions {
  /**
   * Sends the actor under the header's former name, for a host whose browser
   * may reach a Brunch that predates the actor header. Temporary: remove once
   * the Petrinaut website sends the actor header from its own server-side hop.
   */
  readonly legacyActorHeader?: boolean;
}

export const agentOwnershipHeaders = (
  identity: ConversationIdentity,
  { legacyActorHeader = false }: ActorHeaderOptions = {},
): Record<string, string> => ({
  [legacyActorHeader ? brunchHeaders.legacyPrincipal : brunchHeaders.actor]:
    identity.actorKey,
  [brunchHeaders.conversation]: identity.conversationId,
});
