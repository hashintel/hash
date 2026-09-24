import type { FlueConversationSnapshot } from "@flue/sdk";

/** Fields `parseWorkedModelFixture` actually inspects; not a Flue snapshot schema. */
export const isRetainedFixtureSession = (
  value: unknown,
): value is FlueConversationSnapshot =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  "v" in value &&
  value.v === 1 &&
  "conversationId" in value &&
  typeof value.conversationId === "string" &&
  "messages" in value &&
  Array.isArray(value.messages) &&
  "settlements" in value &&
  Array.isArray(value.settlements);
