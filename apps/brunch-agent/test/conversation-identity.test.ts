import { expect, test } from "vitest";

import { flueConversationIdWeb } from "@hashintel/brunch-agent-transport-aisdk";

import {
  flueConversationId,
  flueConversationIdFrom,
  ownsFlueInstance,
} from "../src/conversation/identity.ts";

test("the same principal and conversation id always hash to the same Flue instance", () => {
  expect(flueConversationId("principal-a", "conversation-1")).toBe(
    flueConversationId("principal-a", "conversation-1"),
  );
});

test("a different principal cannot address the same Flue instance", () => {
  const owned = flueConversationId("principal-a", "conversation-1");
  const foreign = flueConversationId("principal-b", "conversation-1");
  expect(owned).not.toBe(foreign);
  expect(owned).toMatch(/^[0-9a-f]{64}$/);
  expect(foreign).toMatch(/^[0-9a-f]{64}$/);
});

test("ownsFlueInstance admits only the principal and conversation that hashed the id", () => {
  const identity = {
    principalKey: "principal-a",
    conversationId: "conversation-1",
  };
  const instanceId = flueConversationIdFrom(identity);
  expect(
    ownsFlueInstance(
      identity.principalKey,
      identity.conversationId,
      instanceId,
    ),
  ).toBe(true);
  expect(
    ownsFlueInstance("principal-b", identity.conversationId, instanceId),
  ).toBe(false);
  expect(
    ownsFlueInstance(identity.principalKey, "conversation-2", instanceId),
  ).toBe(false);
  expect(
    ownsFlueInstance(
      identity.principalKey,
      identity.conversationId,
      "not-a-hash",
    ),
  ).toBe(false);
});

test("the browser hash matches the Node hash", async () => {
  expect(await flueConversationIdWeb("principal-a", "conversation-1")).toBe(
    flueConversationId("principal-a", "conversation-1"),
  );
});
