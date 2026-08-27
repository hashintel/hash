import { expect, test } from "vitest";

import { flueConversationId } from "../src/conversation-identity.ts";

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
