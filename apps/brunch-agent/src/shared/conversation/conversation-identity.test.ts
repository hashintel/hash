import { expect, test } from "vitest";

import {
  agentOwnershipHeaders,
  flueConversationIdWeb,
} from "@hashintel/brunch-agent";

import { flueConversationId, ownsFlueInstance } from "./identity.ts";

// Stored conversations are addressed by this hash, so it and the header names
// must survive any rename of the identity's fields.
test("a fixed owner key and conversation id keep their Flue instance id and headers", async () => {
  const identity = {
    ownerKey: "brunch-owner",
    conversationId: "conversation-1",
  };
  const pinnedInstanceId =
    "569d4642dc746a69137ad2c10ee75f79c2be15df09b14a665fb497937063f1a6";
  expect(flueConversationId(identity)).toBe(pinnedInstanceId);
  expect(await flueConversationIdWeb(identity)).toBe(pinnedInstanceId);
  expect(agentOwnershipHeaders(identity)).toEqual({
    "x-brunch-principal": "brunch-owner",
    "x-brunch-conversation": "conversation-1",
  });
});

test("the same owner key and conversation id always hash to the same Flue instance", () => {
  const identity = {
    ownerKey: "owner-a",
    conversationId: "conversation-1",
  };
  expect(flueConversationId(identity)).toBe(flueConversationId(identity));
});

test("a different owner key cannot address the same Flue instance", () => {
  const owned = flueConversationId({
    ownerKey: "owner-a",
    conversationId: "conversation-1",
  });
  const foreign = flueConversationId({
    ownerKey: "owner-b",
    conversationId: "conversation-1",
  });
  expect(owned).not.toBe(foreign);
  expect(owned).toMatch(/^[0-9a-f]{64}$/);
  expect(foreign).toMatch(/^[0-9a-f]{64}$/);
});

test("ownsFlueInstance admits only the owner key and conversation that hashed the id", () => {
  const identity = {
    ownerKey: "owner-a",
    conversationId: "conversation-1",
  };
  const instanceId = flueConversationId(identity);
  expect(ownsFlueInstance(identity, instanceId)).toBe(true);
  expect(
    ownsFlueInstance({ ...identity, ownerKey: "owner-b" }, instanceId),
  ).toBe(false);
  expect(
    ownsFlueInstance(
      { ...identity, conversationId: "conversation-2" },
      instanceId,
    ),
  ).toBe(false);
  expect(ownsFlueInstance(identity, "not-a-hash")).toBe(false);
});

test("the browser hash matches the Node hash", async () => {
  const identity = {
    ownerKey: "owner-a",
    conversationId: "conversation-1",
  };
  expect(await flueConversationIdWeb(identity)).toBe(
    flueConversationId(identity),
  );
});
