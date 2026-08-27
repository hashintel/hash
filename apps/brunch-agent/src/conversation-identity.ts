/** Stable Flue instance id for one principal + panel conversation. */

import { createHash, timingSafeEqual } from "node:crypto";

import {
  BRUNCH_CONVERSATION_HEADER,
  BRUNCH_PRINCIPAL_HEADER,
  identityPayload,
} from "./conversation-payload.ts";

import type { ConversationIdentity } from "@hashintel/brunch-agent-transport-aisdk";

export {
  BRUNCH_CONVERSATION_HEADER,
  BRUNCH_PRINCIPAL_HEADER,
  LOCAL_UI_PRINCIPAL,
} from "./conversation-payload.ts";
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

export const agentOwnershipHeaders = (
  identity: ConversationIdentity,
): Record<string, string> => ({
  [BRUNCH_PRINCIPAL_HEADER]: identity.principalKey,
  [BRUNCH_CONVERSATION_HEADER]: identity.conversationId,
});
