/**
 * @vitest-environment jsdom
 */
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

import { useFlueChatHistory } from "./use-flue-chat-history";

import type { FlueClient, FlueConversationSnapshot } from "@flue/sdk";

afterEach(() => {
  cleanup();
});

const clientWithHistory = (
  history: () => Promise<FlueConversationSnapshot>,
): Promise<FlueClient> =>
  Promise.resolve({ history } as Pick<FlueClient, "history"> as FlueClient);

test("hydrates through the public Flue history projection", async () => {
  const clientPromise = clientWithHistory(async () => ({
    v: 1,
    conversationId: "conversation-1",
    offset: "offset-1",
    settlements: [],
    messages: [
      {
        id: "assistant-1",
        role: "assistant",
        purpose: "assistant",
        display: "visible",
        parts: [{ type: "text", text: "Canonical reply.", state: "done" }],
      },
    ],
  }));
  const { result } = renderHook(() =>
    useFlueChatHistory(clientPromise, "conversation-1"),
  );

  await waitFor(() => expect(result.current.ready).toBe(true));
  expect(result.current.messages).toStrictEqual([
    {
      id: "assistant-1",
      role: "assistant",
      parts: [{ type: "text", text: "Canonical reply.", state: "done" }],
    },
  ]);
});

test("asks nothing of the generic chat route, which keeps no history", () => {
  const { result } = renderHook(() =>
    useFlueChatHistory(null, "conversation-1"),
  );

  expect(result.current.ready).toBe(false);
  expect(result.current.messages).toBeUndefined();
});

test("leaves the panel on its local cache when hydration fails", async () => {
  const history = vi.fn(async (): Promise<FlueConversationSnapshot> => {
    throw new Error("missing conversation");
  });
  const clientPromise = clientWithHistory(history);
  const { result } = renderHook(() =>
    useFlueChatHistory(clientPromise, "conversation-1"),
  );

  await waitFor(() => expect(history).toHaveBeenCalled());
  expect(result.current.ready).toBe(false);
  expect(result.current.messages).toBeUndefined();
});
