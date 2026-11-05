// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { useLayoutEffect } from "react";
import { afterEach, expect, test, vi } from "vitest";

import {
  conversationWordsKey,
  useConversationWords,
} from "./conversation-words";

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});

test("conversation and owner key scope isolate lists and reload restores entries", () => {
  const hook = renderHook(
    ({ conversation }) => useConversationWords("person", conversation),
    { initialProps: { conversation: "one" } },
  );
  act(() => hook.result.current.save([{ id: "word", spelling: "RelayDesk" }]));
  expect(hook.result.current.entries[0]?.spelling).toBe("RelayDesk");
  expect(conversationWordsKey("person", "one")).not.toBe(
    conversationWordsKey("other", "one"),
  );
  hook.rerender({ conversation: "two" });
  expect(hook.result.current.entries).toEqual([]);
  hook.rerender({ conversation: "one" });
  expect(hook.result.current.entries[0]?.spelling).toBe("RelayDesk");
  act(() => hook.result.current.clear());
  expect(
    localStorage.getItem(conversationWordsKey("person", "one")),
  ).toBeNull();
});

test("layout effects read each conversation's saved words on its first render", () => {
  for (const [conversation, spelling] of [
    ["one", "RelayDesk"],
    ["two", "SDCPN"],
  ] as const) {
    localStorage.setItem(
      conversationWordsKey("person", conversation),
      JSON.stringify({ version: 1, entries: [{ id: "word", spelling }] }),
    );
  }
  const seen: (readonly string[])[] = [];
  const hook = renderHook(
    ({ conversation }) => {
      const words = useConversationWords("person", conversation);
      useLayoutEffect(() => {
        seen.push(words.entries.map((word) => word.spelling));
      });
      return words;
    },
    { initialProps: { conversation: "one" } },
  );
  hook.rerender({ conversation: "two" });
  expect(seen).toEqual([["RelayDesk"], ["SDCPN"]]);
});

test("invalid persisted input is not used or silently overwritten", () => {
  const key = conversationWordsKey("person", "one");
  localStorage.setItem(key, "broken");
  const hook = renderHook(() => useConversationWords("person", "one"));
  expect(hook.result.current.entries).toEqual([]);
  expect(hook.result.current.notice).toContain("could not be loaded");
  expect(localStorage.getItem(key)).toBe("broken");
});

test("quota failure keeps usable tab-local words and discloses the failure", () => {
  const hook = renderHook(() => useConversationWords("person", "one"));
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  act(() => hook.result.current.save([{ id: "word", spelling: "Café" }]));
  expect(hook.result.current.entries[0]?.spelling).toBe("Café");
  expect(hook.result.current.notice).toContain("Available in this tab");
});

test("cross-tab updates refresh only the bound conversation and an owner key switch never inherits words", () => {
  const hook = renderHook(
    ({ ownerKey }) => useConversationWords(ownerKey, "one"),
    { initialProps: { ownerKey: "person" } },
  );
  const key = conversationWordsKey("person", "one");
  localStorage.setItem(
    key,
    JSON.stringify({ version: 1, entries: [{ id: "word", spelling: "Café" }] }),
  );
  act(() => {
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: conversationWordsKey("person", "two"),
        storageArea: localStorage,
      }),
    );
  });
  expect(hook.result.current.entries).toEqual([]);
  act(() => {
    window.dispatchEvent(
      new StorageEvent("storage", { key, storageArea: localStorage }),
    );
  });
  expect(hook.result.current.entries[0]?.spelling).toBe("Café");
  hook.rerender({ ownerKey: "another" });
  expect(hook.result.current.entries).toEqual([]);
});

test("blocked access to localStorage itself still permits tab-local editing", () => {
  const blocked = vi
    .spyOn(window, "localStorage", "get")
    .mockImplementation(() => {
      throw new Error("blocked");
    });
  const hook = renderHook(() => useConversationWords("person", "one"));
  act(() => hook.result.current.save([{ id: "word", spelling: "RelayDesk" }]));
  expect(hook.result.current.entries[0]?.spelling).toBe("RelayDesk");
  expect(hook.result.current.notice).toContain("Available in this tab");
  blocked.mockRestore();
});
