import {
  createUIMessageStreamResponse,
  DefaultChatTransport,
  type UIMessage,
  type UIMessageChunk,
} from "ai";
import { afterEach, expect, test, vi } from "vitest";

import { sseHeartbeatComment, withSseHeartbeat } from "./sse-heartbeat";

afterEach(() => {
  vi.useRealTimers();
});

const encoder = new TextEncoder();

/** A source the test writes, as an SSE response, and the wrapped response's text as read so far. */
const openStream = (intervalMs: number) => {
  let source!: ReadableStreamDefaultController<Uint8Array>;
  const cancel = vi.fn<(reason: unknown) => void>();
  const response = withSseHeartbeat(
    new Response(
      new ReadableStream<Uint8Array>({
        start: (controller) => {
          source = controller;
        },
        cancel,
      }),
      { status: 200, headers: { "content-type": "text/event-stream" } },
    ),
    { intervalMs },
  );
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  const read = { text: "", done: false, error: undefined as unknown };
  void (async () => {
    try {
      for (;;) {
        // Each read waits for the one before.
        // eslint-disable-next-line no-await-in-loop
        const next = await reader.read();
        if (next.done) break;
        read.text += decoder.decode(next.value, { stream: true });
      }
      read.done = true;
    } catch (error) {
      read.error = error;
    }
  })();
  return {
    response,
    reader,
    read,
    cancel,
    write: (text: string) => source.enqueue(encoder.encode(text)),
    close: () => source.close(),
    fail: (error: unknown) => source.error(error),
  };
};

test("an idle stream carries a comment after each interval without bytes, and the response keeps its status and headers", async () => {
  vi.useFakeTimers();
  const stream = openStream(30_000);
  expect(stream.response.status).toBe(200);
  expect(stream.response.headers.get("content-type")).toBe("text/event-stream");
  stream.write("data: 1\n\n");
  await vi.advanceTimersByTimeAsync(29_999);
  expect(stream.read.text).toBe("data: 1\n\n");
  await vi.advanceTimersByTimeAsync(1);
  expect(stream.read.text).toBe(`data: 1\n\n${sseHeartbeatComment}`);
  await vi.advanceTimersByTimeAsync(30_000);
  expect(stream.read.text).toBe(
    `data: 1\n\n${sseHeartbeatComment}${sseHeartbeatComment}`,
  );

  // Bytes restart the interval.
  await vi.advanceTimersByTimeAsync(20_000);
  stream.write("data: 2\n\n");
  await vi.advanceTimersByTimeAsync(20_000);
  expect(stream.read.text).toBe(
    `data: 1\n\n${sseHeartbeatComment}${sseHeartbeatComment}data: 2\n\n`,
  );

  stream.close();
  await vi.advanceTimersByTimeAsync(0);
  expect(stream.read.done).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});

test("a heartbeat waits for the event in progress to end", async () => {
  vi.useFakeTimers();
  const stream = openStream(30_000);
  stream.write('data: {"a":');
  await vi.advanceTimersByTimeAsync(90_000);
  expect(stream.read.text).toBe('data: {"a":');
  stream.write("1}\n");
  await vi.advanceTimersByTimeAsync(30_000);
  expect(stream.read.text).toBe('data: {"a":1}\n');
  stream.write("\n");
  await vi.advanceTimersByTimeAsync(30_000);
  expect(stream.read.text).toBe(`data: {"a":1}\n\n${sseHeartbeatComment}`);
  stream.close();
});

test("the client's cancel reaches the source and stops the heartbeat", async () => {
  vi.useFakeTimers();
  const stream = openStream(30_000);
  stream.write("data: 1\n\n");
  await vi.advanceTimersByTimeAsync(0);
  await stream.reader.cancel("gone");
  expect(stream.cancel).toHaveBeenCalledWith("gone");
  expect(vi.getTimerCount()).toBe(0);
});

test("a source error errors the stream and stops the heartbeat", async () => {
  vi.useFakeTimers();
  const stream = openStream(30_000);
  const failure = new Error("source failed");
  stream.fail(failure);
  await vi.advanceTimersByTimeAsync(0);
  expect(stream.read.error).toBe(failure);
  expect(vi.getTimerCount()).toBe(0);
});

test("AI SDK's chat transport reads the same chunks from a stream with heartbeats as from one without", async () => {
  const chunks: UIMessageChunk[] = [
    { type: "start", messageId: "assistant-1" },
    { type: "text-start", id: "text-1" },
    { type: "text-delta", id: "text-1", delta: "Waiting " },
    {
      type: "tool-input-available",
      toolCallId: "call-1",
      toolName: "ask",
      input: { q: 1 },
    },
    { type: "text-delta", id: "text-1", delta: "on you." },
    { type: "text-end", id: "text-1" },
    { type: "finish", finishReason: "stop" },
  ];
  /** The chunks, a few milliseconds apart, so heartbeats fall between them. */
  const slowChunks = () =>
    new ReadableStream<UIMessageChunk>({
      start: async (controller) => {
        for (const chunk of chunks) {
          controller.enqueue(chunk);
          // Spaced on purpose, so the heartbeat interval passes between chunks.
          // eslint-disable-next-line no-await-in-loop
          await new Promise((resolve) => {
            setTimeout(resolve, 15);
          });
        }
        controller.close();
      },
    });
  let raw = "";
  const read = async (heartbeat: boolean) => {
    const transport = new DefaultChatTransport<UIMessage>({
      api: "https://agents.test/chat",
      fetch: async () => {
        const response = createUIMessageStreamResponse({
          stream: slowChunks(),
        });
        if (!heartbeat) return response;
        const [forTransport, forTest] = withSseHeartbeat(response, {
          intervalMs: 2,
        }).body!.tee();
        void new Response(forTest).text().then((text) => {
          raw = text;
        });
        return new Response(forTransport, { headers: response.headers });
      },
    });
    const stream = await transport.sendMessages({
      trigger: "submit-message",
      chatId: "chat-1",
      messageId: undefined,
      messages: [],
      abortSignal: undefined,
    });
    const read: UIMessageChunk[] = [];
    for await (const chunk of stream) read.push(chunk);
    return read;
  };
  const plain = await read(false);
  const withHeartbeats = await read(true);
  expect(plain).toEqual(chunks);
  expect(withHeartbeats).toEqual(plain);
  await vi.waitFor(() => {
    expect(raw).toContain(sseHeartbeatComment);
  });
});
