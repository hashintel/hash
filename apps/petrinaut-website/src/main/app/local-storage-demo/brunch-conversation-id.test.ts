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

test("scopes ordinary construction conversations to the net incarnation", () => {
  expect(ordinaryConstructionConversationIdFrom("incarnation-1")).toBe(
    "brunch-construction-v1:incarnation-1",
  );
});

test("isolates every evaluation mode in the conversation namespace", () => {
  const base = ordinaryConstructionConversationIdFrom("incarnation-1");
  expect(
    (["F", "I", "A", "B"] as const).map((mode) =>
      brunchEvaluationConversationIdFrom(base, mode),
    ),
  ).toEqual([
    `${base}:evaluation-F`,
    `${base}:evaluation-I`,
    `${base}:evaluation-A`,
    `${base}:evaluation-B`,
  ]);
});
