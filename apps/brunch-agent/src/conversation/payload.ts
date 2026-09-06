/** Identity headers and payload encoding shared by Node and the local Flue UI. */

export { BRUNCH_PRINCIPAL_HEADER } from "@hashintel/brunch-agent-transport-aisdk/headers";

export const BRUNCH_CONVERSATION_HEADER = "x-brunch-conversation";

/** Principal for the stock Flue UI at `/`. Not a second ownership rule. */
export const LOCAL_UI_PRINCIPAL = "local";

export const identityPayload = (
  principalKey: string,
  conversationId: string,
): Uint8Array => {
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

export const hexFromDigest = (digest: ArrayBuffer): string =>
  [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
