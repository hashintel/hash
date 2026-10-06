/**
 * @vitest-environment jsdom
 */
import { renderHook } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";

import { toNetId } from "@hashintel/petrinaut-core";

import { useLocalStorageAiMessages } from "./use-local-storage-ai-messages";

const storageKey = "petrinaut-ai-messages";

const conversation = (text: string) => [
  { id: text, role: "user", parts: [{ type: "text", text }] },
];

afterEach(() => localStorage.clear());

test("keys stored conversations by net id, preferring the canonical entry", () => {
  const netId = toNetId("net-1");
  localStorage.setItem(
    storageKey,
    JSON.stringify({
      "net-1": conversation("legacy"),
      [netId]: conversation("canonical"),
      "net-2": conversation("other"),
    }),
  );

  const { result } = renderHook(() => useLocalStorageAiMessages());

  expect(result.current.aiMessagesByNetId).toStrictEqual({
    [netId]: conversation("canonical"),
    [toNetId("net-2")]: conversation("other"),
  });
});
