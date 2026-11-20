/**
 * @vitest-environment jsdom
 */
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

import { useSuccessorChatHistory } from "./use-successor-chat-history";

import type { SuccessorConversation } from "../../client/successor/successor-endpoints";
import type { UIMessage, UIMessageChunk } from "ai";

afterEach(() => {
  cleanup();
});

const sent: UIMessage = {
  id: "req-1",
  role: "user",
  parts: [{ type: "text", text: "Model a dryer." }],
};
const answered: UIMessage = {
  id: "durable:2",
  role: "assistant",
  parts: [{ type: "text", text: "A dryer it is." }],
};

/** A server whose history answers are held until the test releases each one. */
const heldServer = () => {
  const pending: ((response: Response) => void)[] = [];
  const fetch = vi.fn<typeof globalThis.fetch>(
    () =>
      new Promise<Response>((resolve) => {
        pending.push(resolve);
      }),
  );
  const answer = (response: Response) => {
    const next = pending.shift();
    if (next === undefined) throw new Error("No history read is waiting.");
    next(response);
  };
  return { fetch, answer, waiting: () => pending.length };
};

const conversationWith = (
  fetch: typeof globalThis.fetch,
): SuccessorConversation => ({
  endpoint: "http://durable.test",
  actorKey: "actor-1",
  conversationId: "conversation-1",
  web: "web-1",
  fetch,
});

const streamOf = (chunks: readonly UIMessageChunk[]) =>
  new ReadableStream<UIMessageChunk>({
    start: (controller) => {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });

const drain = async (stream: ReadableStream<UIMessageChunk>) => {
  for await (const _chunk of stream) {
    // Read to the end, as the chat does.
  }
};

test("reads nothing without a conversation", () => {
  const server = heldServer();
  const { result } = renderHook(() => useSuccessorChatHistory(null));

  expect(server.fetch).not.toHaveBeenCalled();
  expect(result.current).toMatchObject({
    phase: undefined,
    ready: false,
    messages: undefined,
    snapshot: undefined,
  });
});

test("opens an unknown conversation as a known, empty history", async () => {
  const server = heldServer();
  const conversation = conversationWith(server.fetch);
  const { result } = renderHook(() => useSuccessorChatHistory(conversation));
  expect(result.current).toMatchObject({ phase: "loading", ready: false });

  await waitFor(() => expect(server.waiting()).toBe(1));
  await act(async () => server.answer(new Response(null, { status: 404 })));

  expect(result.current).toMatchObject({
    phase: "absent",
    ready: true,
    messages: [],
    snapshot: undefined,
    error: undefined,
  });
});

test("opens a conversation's history as the chat's messages and Flue's snapshot", async () => {
  const server = heldServer();
  const conversation = conversationWith(server.fetch);
  const { result } = renderHook(() => useSuccessorChatHistory(conversation));

  await waitFor(() => expect(server.waiting()).toBe(1));
  await act(async () => server.answer(Response.json([sent, answered])));

  expect(result.current.phase).toBe("live");
  expect(result.current.ready).toBe(true);
  expect(result.current.messages?.map(({ id }) => id)).toEqual([
    "req-1",
    "durable:2",
  ]);
  expect(result.current.snapshot).toMatchObject({
    conversationId: "conversation-1",
    messages: [
      { id: "req-1", purpose: "user", submissionId: "req-1" },
      { id: "durable:2", purpose: "assistant", submissionId: "req-1" },
    ],
    settlements: [],
  });
});

test("reports a history it could not read", async () => {
  const server = heldServer();
  const conversation = conversationWith(server.fetch);
  const { result } = renderHook(() => useSuccessorChatHistory(conversation));

  await waitFor(() => expect(server.waiting()).toBe(1));
  await act(async () =>
    server.answer(Response.json({ error: "Forbidden." }, { status: 403 })),
  );

  expect(result.current.phase).toBe("error");
  expect(result.current.ready).toBe(false);
  expect(result.current.error?.message).toMatch(/Forbidden\./u);
});

test("reads the history again when a followed turn ends, and settles it only in a history read after", async () => {
  const server = heldServer();
  const conversation = conversationWith(server.fetch);
  const { result } = renderHook(() => useSuccessorChatHistory(conversation));
  await waitFor(() => expect(server.waiting()).toBe(1));

  // The send's admission asks for a read, which the turn's end overtakes.
  act(() => result.current.refresh());
  const followed = result.current.followStream(
    streamOf([{ type: "start", messageId: "durable:2" }, { type: "finish" }]),
    "req-1",
  );
  await act(() => drain(followed));
  await act(async () => server.answer(Response.json([sent, answered])));

  // The read in flight when the turn ended may predate its end.
  expect(result.current.snapshot?.settlements).toEqual([]);
  await waitFor(() => expect(server.waiting()).toBe(1));
  await act(async () => server.answer(Response.json([sent, answered])));

  expect(result.current.snapshot?.settlements).toEqual([
    { submissionId: "req-1", outcome: "completed" },
  ]);
  expect(server.fetch).toHaveBeenCalledTimes(2);
});

test("reads the history again at each Ledger commit's result, so the Ledger follows the turn", async () => {
  const server = heldServer();
  const conversation = conversationWith(server.fetch);
  const { result } = renderHook(() => useSuccessorChatHistory(conversation));
  await waitFor(() => expect(server.waiting()).toBe(1));
  await act(async () => server.answer(Response.json([sent])));

  await act(() =>
    drain(
      result.current.followStream(
        streamOf([
          { type: "start", messageId: "durable:2" },
          {
            type: "tool-input-available",
            toolCallId: "commit-1",
            toolName: "ledger_commit",
            input: {},
            providerExecuted: true,
          },
          {
            type: "tool-output-available",
            toolCallId: "commit-1",
            output: {},
            providerExecuted: true,
          },
        ]),
      ),
    ),
  );

  await waitFor(() => expect(server.fetch).toHaveBeenCalledTimes(2));
});

test("settles the turns it sent once a stop has been answered", async () => {
  const server = heldServer();
  const conversation = conversationWith(server.fetch);
  const { result } = renderHook(() => useSuccessorChatHistory(conversation));
  await waitFor(() => expect(server.waiting()).toBe(1));
  await act(async () => server.answer(Response.json([])));

  // Stopped before any output: its stream was cancelled, and nothing marks it.
  const followed = result.current.followStream(
    new ReadableStream<UIMessageChunk>(),
    "req-1",
  );
  await followed.cancel();
  act(() => result.current.settleStop());

  await waitFor(() => expect(server.waiting()).toBe(1));
  await act(async () => server.answer(Response.json([sent])));
  expect(result.current.snapshot?.settlements).toEqual([
    { submissionId: "req-1", outcome: "aborted" },
  ]);
});

test("starts afresh for another conversation", async () => {
  const server = heldServer();
  const first = conversationWith(server.fetch);
  const second = { ...first, conversationId: "conversation-2" };
  const { result, rerender } = renderHook(
    ({ conversation }) => useSuccessorChatHistory(conversation),
    { initialProps: { conversation: first } },
  );
  await waitFor(() => expect(server.waiting()).toBe(1));
  await act(async () => server.answer(Response.json([sent, answered])));

  rerender({ conversation: second });

  expect(result.current).toMatchObject({ phase: "loading", ready: false });
  expect(result.current.messages).toBeUndefined();
  await waitFor(() => expect(server.waiting()).toBe(1));
  await act(async () => server.answer(Response.json([])));
  expect(result.current.snapshot?.conversationId).toBe("conversation-2");
  expect(result.current.messages).toEqual([]);
});
