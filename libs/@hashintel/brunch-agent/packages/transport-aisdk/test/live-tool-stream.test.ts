import { expect, test, vi } from "vitest";

import { readLiveToolStream } from "../src/live-tool-stream";

test("reads fragmented SSE data with ownership headers and no reconnect", async () => {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const payload = [
        {
          instanceId: "instance-1",
          kind: "tool-input-start",
          sequence: 0,
          submissionId: "submission-1",
          toolCallId: "call-1",
          toolName: "read_workpiece",
          turnId: "turn-1",
          v: 1,
        },
        {
          instanceId: "instance-1",
          kind: "tool-input-delta",
          inputTextDelta: '{"includeContent":false}',
          sequence: 1,
          submissionId: "submission-1",
          toolCallId: "call-1",
          toolName: "read_workpiece",
          turnId: "turn-1",
          v: 1,
        },
      ]
        .map((event) => `data: ${JSON.stringify(event)}\r\n\r\n`)
        .join("");
      const split = Math.floor(payload.length / 2);
      controller.enqueue(encoder.encode(payload.slice(0, split)));
      controller.enqueue(encoder.encode(payload.slice(split)));
      controller.close();
    },
  });
  const fetchImplementation = vi.fn<typeof fetch>(async () => {
    return new Response(body, {
      headers: { "content-type": "text/event-stream" },
    });
  });
  const events: unknown[] = [];

  await readLiveToolStream({
    conversationUrl: "https://brunch.test/agents/chat/instance-1///",
    onEvent: (event) => events.push(event),
    options: {
      fetch: fetchImplementation,
      headers: {
        "x-brunch-conversation": "conversation-1",
        "x-brunch-principal": "principal-1",
      },
    },
    signal: new AbortController().signal,
    submissionId: "submission-1",
  });

  expect(fetchImplementation).toHaveBeenCalledOnce();
  const [requestUrl, requestInit] = fetchImplementation.mock.calls[0] ?? [];
  expect(requestUrl).toBeInstanceOf(URL);
  if (!(requestUrl instanceof URL)) {
    throw new Error("Expected the live reader to fetch a URL.");
  }
  expect(requestUrl.href).toBe(
    "https://brunch.test/agents/chat/instance-1/live?submissionId=submission-1",
  );
  expect(requestInit?.headers).toMatchObject({
    accept: "text/event-stream",
    "x-brunch-conversation": "conversation-1",
    "x-brunch-principal": "principal-1",
  });
  expect(events.map((event) => (event as { kind: string }).kind)).toEqual([
    "tool-input-start",
    "tool-input-delta",
  ]);
});

test("fails closed on malformed live events", async () => {
  await expect(
    readLiveToolStream({
      conversationUrl: "https://brunch.test/agents/chat/instance-1",
      onEvent: () => {},
      options: {
        fetch: async () =>
          new Response('data: {"v":1,"kind":"tool-input-start"}\n\n'),
        headers: {},
      },
      signal: new AbortController().signal,
      submissionId: "submission-1",
    }),
  ).rejects.toThrow("invalid event");
});
