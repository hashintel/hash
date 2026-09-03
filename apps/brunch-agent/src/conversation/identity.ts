/** Stable Flue instance id for one principal + panel conversation. */

import { createHash, timingSafeEqual } from "node:crypto";

import {
  identityPayload,
  type ConversationIdentity,
} from "@hashintel/brunch-agent-transport-aisdk";

import { LOCAL_UI_PRINCIPAL } from "./payload.ts";

export {
  agentOwnershipHeaders,
  BRUNCH_CONVERSATION_HEADER,
  BRUNCH_PRINCIPAL_HEADER,
} from "@hashintel/brunch-agent-transport-aisdk";
export { LOCAL_UI_PRINCIPAL } from "./payload.ts";
export type { ConversationIdentity };

export const flueConversationId = (
  principalKey: string,
  conversationId: string,
): string =>
  createHash("sha256")
    .update(identityPayload(principalKey, conversationId))
    .digest("hex");

export const flueConversationIdFrom = (
  identity: ConversationIdentity,
): string => flueConversationId(identity.principalKey, identity.conversationId);

export const ownsFlueInstance = (
  principalKey: string,
  conversationId: string,
  instanceId: string,
): boolean => {
  const expected = flueConversationId(principalKey, conversationId);
  const expectedBytes = Buffer.from(expected);
  const presentedBytes = Buffer.from(instanceId);
  if (expectedBytes.length !== presentedBytes.length) return false;
  return timingSafeEqual(expectedBytes, presentedBytes);
};
