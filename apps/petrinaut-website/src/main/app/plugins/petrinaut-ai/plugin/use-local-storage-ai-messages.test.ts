/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";

import { toPetrinautId } from "@hashintel/petrinaut-core";

import { useLocalStorageAiMessages } from "./use-local-storage-ai-messages";

import type { PetrinautAiMessage } from "../../_shared/chat/ai-message";

const storageKey = "petrinaut-ai-messages";

const conversation = (text: string): PetrinautAiMessage[] => [
  { id: text, role: "user", parts: [{ type: "text", text }] },
];

const stored = () =>
  JSON.parse(localStorage.getItem(storageKey) ?? "{}") as unknown;

afterEach(() => localStorage.clear());

test("reads a document's conversation under its net id, preferring the canonical entry over a legacy key", () => {
  const netId = toPetrinautId("net-1");
  localStorage.setItem(
    storageKey,
    JSON.stringify({
      "net-1": conversation("legacy"),
      [netId]: conversation("canonical"),
      "net-2": conversation("other"),
    }),
  );

  const { result } = renderHook(() => useLocalStorageAiMessages(netId));
  const { result: other } = renderHook(() =>
    useLocalStorageAiMessages(toPetrinautId("net-2")),
  );

  expect(result.current[0]).toStrictEqual(conversation("canonical"));
  expect(other.current[0]).toStrictEqual(conversation("other"));
});

test("replaces and clears one document's conversation and keeps the others", () => {
  const netId = toPetrinautId("net");
  const otherNetId = toPetrinautId("other");
  localStorage.setItem(
    storageKey,
    JSON.stringify({ [otherNetId]: conversation("other") }),
  );
  const { result } = renderHook(() => useLocalStorageAiMessages(netId));

  act(() => result.current[1](conversation("first")));
  expect(result.current[0]).toStrictEqual(conversation("first"));
  expect(stored()).toStrictEqual({
    [otherNetId]: conversation("other"),
    [netId]: conversation("first"),
  });

  act(() => result.current[1](undefined));
  expect(result.current[0]).toBeUndefined();
  expect(stored()).toStrictEqual({ [otherNetId]: conversation("other") });
});
