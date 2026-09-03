import { expect, test } from "vitest";

import { flueConversationIdWeb } from "@hashintel/brunch-agent-transport-aisdk";

import {
  flueConversationId,
  flueConversationIdFrom,
  ownsFlueInstance,
} from "../src/conversation/identity.ts";

test("the same principal and conversation id always hash to the same Flue instance", () => {
  const identity = {
    principalKey: "principal-a",
    conversationId: "conversation-1",
  };
  expect(flueConversationId(identity)).toBe(flueConversationId(identity));
});

test("a different principal cannot address the same Flue instance", () => {
  const owned = flueConversationId({
    principalKey: "principal-a",
    conversationId: "conversation-1",
  });
  const foreign = flueConversationId({
    principalKey: "principal-b",
    conversationId: "conversation-1",
  });
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
  expect(ownsFlueInstance(identity, instanceId)).toBe(true);
  expect(
    ownsFlueInstance({ ...identity, principalKey: "principal-b" }, instanceId),
  ).toBe(false);
  expect(
    ownsFlueInstance({ ...identity, conversationId: "conversation-2" }, instanceId),
  ).toBe(false);
  expect(ownsFlueInstance(identity, "not-a-hash")).toBe(false);
});

test("the browser hash matches the Node hash", async () => {
  const identity = {
    principalKey: "principal-a",
    conversationId: "conversation-1",
  };
  expect(await flueConversationIdWeb(identity)).toBe(
    flueConversationId(identity),
  );
});
