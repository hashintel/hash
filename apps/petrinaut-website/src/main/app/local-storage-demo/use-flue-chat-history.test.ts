import { FlueApiError } from "@flue/sdk";
/**
 * @vitest-environment jsdom
 */
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

import { useFlueChatHistory } from "./use-flue-chat-history";

import type {
  AgentConversationObservation,
  AgentConversationObservationSnapshot,
  FlueClient,
} from "@flue/sdk";

afterEach(() => {
  cleanup();
});

const createObservationHarness = (
  initialSnapshot: AgentConversationObservationSnapshot,
) => {
  let snapshot = initialSnapshot;
  const listeners = new Set<() => void>();
  const refresh = vi.fn();
  const close = vi.fn();
  const observation: AgentConversationObservation = {
    close,
    getSnapshot: () => snapshot,
    refresh,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  const observe = vi.fn(() => observation);
  return {
    clientPromise: Promise.resolve({
      observe,
    } as Pick<FlueClient, "observe"> as FlueClient),
    close,
    observe,
    publish(next: AgentConversationObservationSnapshot) {
      snapshot = next;
      for (const listener of listeners) listener();
    },
    refresh,
  };
};

test("hydrates through the public Flue observation projection", async () => {
  const harness = createObservationHarness({
    conversation: {
      conversationId: "conversation-1",
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
    },
    offset: "offset-1",
    phase: "live",
    error: undefined,
  });
  const { result } = renderHook(() =>
    useFlueChatHistory(harness.clientPromise, "conversation-1"),
  );

  await waitFor(() => expect(result.current.ready).toBe(true));
  expect(result.current.messages).toStrictEqual([
    {
      id: "assistant-1",
      role: "assistant",
      parts: [{ type: "text", text: "Canonical reply.", state: "done" }],
    },
  ]);
  expect(result.current.phase).toBe("live");
  expect(harness.observe).toHaveBeenCalledWith({ live: "sse" });
});

test("exposes the canonical settlement index for Voice correlation", async () => {
  const harness = createObservationHarness({
    conversation: {
      conversationId: "conversation-1",
      settlements: [{ submissionId: "submission-1", outcome: "aborted" }],
      messages: [],
    },
    offset: "offset-1",
    phase: "live",
    error: undefined,
  });
  const { result } = renderHook(() =>
    useFlueChatHistory(harness.clientPromise, "conversation-1"),
  );

  await waitFor(() => expect(result.current.ready).toBe(true));
  expect(result.current.settlements).toEqual([
    { submissionId: "submission-1", outcome: "aborted" },
  ]);
});

test("asks nothing of the generic chat route, which keeps no history", () => {
  const { result } = renderHook(() =>
    useFlueChatHistory(null, "conversation-1"),
  );

  expect(result.current.ready).toBe(false);
  expect(result.current.messages).toBeUndefined();
});

test("represents an absent conversation as an empty canonical history", async () => {
  const harness = createObservationHarness({
    conversation: undefined,
    offset: undefined,
    phase: "absent",
    error: undefined,
  });
  const { result } = renderHook(() =>
    useFlueChatHistory(harness.clientPromise, "conversation-1"),
  );

  await waitFor(() => expect(result.current.phase).toBe("absent"));
  expect(result.current.ready).toBe(true);
  expect(result.current.messages).toEqual([]);
});

test("retains canonical messages while the SDK reconnects", async () => {
  const conversation = {
    conversationId: "conversation-1",
    settlements: [
      { submissionId: "submission-1", outcome: "completed" as const },
    ],
    messages: [
      {
        id: "assistant-1",
        role: "assistant" as const,
        purpose: "assistant" as const,
        display: "visible" as const,
        parts: [
          { type: "text" as const, text: "Settled.", state: "done" as const },
        ],
      },
    ],
  };
  const harness = createObservationHarness({
    conversation,
    offset: "offset-1",
    phase: "live",
    error: undefined,
  });
  const { result } = renderHook(() =>
    useFlueChatHistory(harness.clientPromise, "conversation-1"),
  );
  await waitFor(() => expect(result.current.phase).toBe("live"));

  harness.publish({
    conversation,
    offset: "offset-1",
    phase: "connecting",
    error: new TypeError("network unavailable"),
  });

  await waitFor(() => expect(result.current.phase).toBe("connecting"));
  expect(result.current.messages?.[0]?.id).toBe("assistant-1");
  expect(result.current.latestSettlement?.outcome).toBe("completed");
});

test.each([401, 403])(
  "surfaces fatal ownership status %s and exposes SDK refresh",
  async (status) => {
    const failure = new FlueApiError(status, "");
    const harness = createObservationHarness({
      conversation: undefined,
      offset: undefined,
      phase: "error",
      error: failure,
    });
    const { result } = renderHook(() =>
      useFlueChatHistory(harness.clientPromise, "conversation-1"),
    );

    await waitFor(() => expect(result.current.phase).toBe("error"));
    expect(result.current.error).toBe(failure);
    result.current.refresh();
    expect(harness.refresh).toHaveBeenCalledOnce();
  },
);

test("closes the SDK observation on unmount", async () => {
  const harness = createObservationHarness({
    conversation: undefined,
    offset: undefined,
    phase: "loading",
    error: undefined,
  });
  const { unmount } = renderHook(() =>
    useFlueChatHistory(harness.clientPromise, "conversation-1"),
  );
  await waitFor(() => expect(harness.observe).toHaveBeenCalledOnce());

  unmount();

  expect(harness.close).toHaveBeenCalledOnce();
});

test("projects fixture client-tool results from canonical signal history", async () => {
  const harness = createObservationHarness({
    conversation: {
      conversationId: "conversation-1",
      settlements: [],
      messages: [
        {
          id: "assistant-1",
          role: "assistant",
          purpose: "assistant",
          display: "visible",
          parts: [
            {
              type: "dynamic-tool",
              toolName: "addArc",
              toolCallId: "arc-1",
              state: "output-available",
              input: { placeId: "crew" },
              output: { awaiting: "client" },
            },
          ],
        },
        {
          id: "result-1",
          role: "system",
          purpose: "dispatch",
          display: "diagnostic",
          signal: { tagName: "client-tool-result" },
          parts: [
            {
              type: "text",
              text: JSON.stringify([
                {
                  toolCallId: "arc-1",
                  toolName: "addArc",
                  output: { applied: true },
                },
              ]),
              state: "done",
            },
          ],
        },
      ],
    },
    offset: "offset-2",
    phase: "live",
    error: undefined,
  });
  const clientToolNames = new Set(["addArc"]);
  const { result } = renderHook(() =>
    useFlueChatHistory(
      harness.clientPromise,
      "conversation-1",
      clientToolNames,
    ),
  );

  await waitFor(() => expect(result.current.ready).toBe(true));
  expect(result.current.messages?.[0]?.parts).toEqual([
    {
      type: "tool-addArc",
      toolCallId: "arc-1",
      state: "output-available",
      input: { placeId: "crew" },
      output: { applied: true },
    },
  ]);
  expect(result.current.snapshot?.offset).toBe("offset-2");
  expect(result.current.snapshot?.messages.map(({ id }) => id)).toEqual([
    "assistant-1",
    "result-1",
  ]);

  act(() => {
    result.current.refresh();
  });
  expect(harness.refresh).toHaveBeenCalledTimes(1);
});
