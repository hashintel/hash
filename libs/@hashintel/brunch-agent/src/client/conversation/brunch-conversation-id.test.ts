import { expect, test, vi } from "vitest";

import {
  brunchEvaluationConversationIdFrom,
  getOrCreateBrunchConversationId,
  ordinaryConstructionConversationIdFrom,
} from "./brunch-conversation-id";

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

test("scopes ordinary construction conversations to the net", () => {
  expect(
    ordinaryConstructionConversationIdFrom(
      "56c16f29-0b95-5de8-992d-54db5288e8c4",
    ),
  ).toBe("brunch-construction-v1:56c16f29-0b95-5de8-992d-54db5288e8c4");
});

test("preserves the evaluation-I conversation namespace", () => {
  const base = ordinaryConstructionConversationIdFrom("net-1");
  expect(brunchEvaluationConversationIdFrom(base)).toBe(`${base}:evaluation-I`);
});
