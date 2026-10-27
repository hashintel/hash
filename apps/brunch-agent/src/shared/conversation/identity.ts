/** Stable Flue instance id for one principal + panel conversation. */

import { createHash, timingSafeEqual } from "node:crypto";

import {
  type ConversationIdentity,
  identityPayload,
} from "@hashintel/brunch-agent";

export const flueConversationId = (identity: ConversationIdentity): string =>
  createHash("sha256").update(identityPayload(identity)).digest("hex");

export const ownsFlueInstance = (
  identity: ConversationIdentity,
  instanceId: string,
): boolean => {
  const expected = flueConversationId(identity);
  const expectedBytes = Buffer.from(expected);
  const presentedBytes = Buffer.from(instanceId);
  if (expectedBytes.length !== presentedBytes.length) return false;
  return timingSafeEqual(expectedBytes, presentedBytes);
};
