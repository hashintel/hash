import { expect, test } from "vitest";

import {
  brunchEvaluationConversationIdFrom,
  ordinaryConstructionConversationIdFrom,
  replaceBrunchConversationId,
  storedBrunchConversationId,
} from "./brunch-conversation-id";

test("reads back only the conversation a net was moved to", () => {
  const storedByKey = new Map<string, string>();
  const storage = {
    getItem: (key: string) => storedByKey.get(key) ?? null,
    setItem: (key: string, value: string) => storedByKey.set(key, value),
  };

  expect(storedBrunchConversationId("net-1", storage)).toBeUndefined();
  replaceBrunchConversationId("net-1", "conversation-2", storage);
  expect(storedBrunchConversationId("net-1", storage)).toBe("conversation-2");
  expect(storedBrunchConversationId("net-2", storage)).toBeUndefined();
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
