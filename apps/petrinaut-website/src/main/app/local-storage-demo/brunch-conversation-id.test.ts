import { expect, test, vi } from "vitest";

import { getOrCreateBrunchConversationId } from "./brunch-conversation-id";

test("reuses one conversation id per net across reloads", () => {
  const storedByKey = new Map<string, string>();
  const storage = {
    getItem: (key: string) => storedByKey.get(key) ?? null,
    setItem: (key: string, value: string) => storedByKey.set(key, value),
  };
  const createId = vi.fn(() => "conversation-created-once");

  expect(getOrCreateBrunchConversationId("net-1", storage, createId)).toBe(
    "conversation-created-once",
  );
  expect(getOrCreateBrunchConversationId("net-1", storage, createId)).toBe(
    "conversation-created-once",
  );
  expect(getOrCreateBrunchConversationId("net-2", storage, createId)).toBe(
    "conversation-created-once",
  );
  expect(createId).toHaveBeenCalledTimes(2);
});
