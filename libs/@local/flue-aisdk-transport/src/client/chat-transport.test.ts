import { FetchError, FlueApiError, FlueExecutionError } from "@flue/sdk";
import { expect, test, vi } from "vitest";

import { useUiChunkRecorder } from "../../test/ai-sdk-oracle";
import { useRaisedErrors } from "../../test/raised-errors";
import {
  createFlueChatTransport,
  FlueChatDisconnectError,
} from "./chat-transport";

import type { FlueChatTransportOptions } from "./chat-transport";
import type {
  AgentSendResult,
  ConversationStreamChunk,
  FlueClient,
} from "@flue/sdk";
import type { ChatTransport, UIMessage, UIMessageChunk } from "ai";

const admission: AgentSendResult = {
  streamUrl: "http://agent.test/stream",
  offset: "offset-1",
  submissionId: "submission-1",
  uid: "uid-1",
};

const position = (index: number) => ({ batch: 1, index });

const refusedReconnect = (status: number) =>
  new FetchError(status, "Refused.", undefined, {}, admission.streamUrl);

const completedEvents: readonly ConversationStreamChunk[] = [
  {
    type: "message-started",
    conversationId: "conversation-1",
    messageId: "assistant-1",
    submissionId: admission.submissionId,
    turnId: "turn-1",
    position: position(0),
  },
  {
    type: "message-delta",
    conversationId: "conversation-1",
    messageId: "assistant-1",
    kind: "text",
    delta: "Canonical reply.",
    position: position(1),
  },
  {
    type: "message-completed",
    conversationId: "conversation-1",
    messageId: "assistant-1",
    position: position(2),
  },
  {
    type: "submission-settled",
    conversationId: "conversation-1",
    submissionId: admission.submissionId,
    outcome: "completed",
    position: position(3),
  },
];

const clientWith = (
  events: readonly ConversationStreamChunk[],
): {
  readonly client: FlueClient;
  readonly send: ReturnType<typeof vi.fn<FlueClient["send"]>>;
  readonly wait: ReturnType<typeof vi.fn<FlueClient["wait"]>>;
} => {
  const send = vi.fn<FlueClient["send"]>(async () => admission);
  const wait = vi.fn<FlueClient["wait"]>(async (_admission, options) => {
    // Preserve protocol order while exercising the stateful projector.
    // eslint-disable-next-line no-await-in-loop
    for (const event of events) await options?.onEvent?.(event);
  });
  return {
    client: { send, wait } as Pick<FlueClient, "send" | "wait"> as FlueClient,
    send,
    wait,
  };
};

const recordChunks = useUiChunkRecorder();
const captureRaisedErrors = useRaisedErrors();

const readChunks = async (
  stream: ReadableStream<UIMessageChunk>,
): Promise<UIMessageChunk[]> => {
  const chunks = recordChunks();
  const reader = stream.getReader();
  for (;;) {
    // A stream reader is necessarily consumed in sequence.
    // eslint-disable-next-line no-await-in-loop
    const result = await reader.read();
    if (result.done) return chunks;
    chunks.push(result.value);
  }
};

const sendOptions = (
  messages: UIMessage[],
  messageId?: string,
): Parameters<ChatTransport<UIMessage>["sendMessages"]>[0] => ({
  trigger: "submit-message",
  chatId: "conversation-1",
  messageId,
  messages,
  abortSignal: undefined,
});

test("admits one user message and projects a finite per-turn stream", async () => {
  const { client, send } = clientWith(completedEvents);
  const transport = createFlueChatTransport({
    client,
    clientToolNames: new Set(["render_widget"]),
  });

  const stream = await transport.sendMessages(
    sendOptions([
      {
        id: "user-1",
        role: "user",
        parts: [{ type: "text", text: "Run the transport tracer." }],
      },
    ]),
  );

  expect(send).toHaveBeenCalledOnce();
  expect(send).toHaveBeenCalledWith({
    idempotencyKey: "ai-sdk:user:user-1",
    message: { kind: "user", body: "Run the transport tracer." },
    signal: undefined,
  });
  expect((await readChunks(stream)).map((chunk) => chunk.type)).toEqual([
    "start",
    "start-step",
    "text-start",
    "text-delta",
    "text-end",
    "finish-step",
    "finish",
  ]);
});

test("observers that throw cannot fail the admission or the turn", async () => {
  const raised = captureRaisedErrors();
  const observerFailure = new Error("Observer failure.");
  const throwObserverFailure = () => {
    throw observerFailure;
  };
  const { client } = clientWith(completedEvents);
  const transport = createFlueChatTransport({
    client,
    clientToolNames: new Set(),
    onAdmission: throwObserverFailure,
    onResponseMessage: throwObserverFailure,
    onResponseMessageCompleted: throwObserverFailure,
  });

  const stream = await transport.sendMessages(
    sendOptions([
      { id: "user-1", role: "user", parts: [{ type: "text", text: "Hi" }] },
    ]),
  );

  expect((await readChunks(stream)).map((chunk) => chunk.type)).toEqual([
    "start",
    "start-step",
    "text-start",
    "text-delta",
    "text-end",
    "finish-step",
    "finish",
  ]);
  expect(raised).toEqual([observerFailure, observerFailure, observerFailure]);
});

test("admits the host-derived user turn under its own message identity", async () => {
  const { client, send } = clientWith(completedEvents);
  const onAdmission =
    vi.fn<NonNullable<FlueChatTransportOptions["onAdmission"]>>();
  const transport = createFlueChatTransport({
    client,
    clientToolNames: new Set(),
    submittedUserMessage: (messages) => ({
      messageId: messages.at(0)?.id ?? "missing",
      body: `framed:${messages.length}`,
    }),
    onAdmission,
  });

  await readChunks(
    await transport.sendMessages(
      sendOptions([
        { id: "user-1", role: "user", parts: [{ type: "text", text: "a" }] },
        { id: "host-1", role: "user", parts: [{ type: "text", text: "b" }] },
      ]),
    ),
  );

  expect(send).toHaveBeenCalledWith({
    idempotencyKey: "ai-sdk:user:user-1",
    message: { kind: "user", body: "framed:2" },
    signal: undefined,
  });
  expect(onAdmission).toHaveBeenCalledWith(
    expect.objectContaining({ messageId: "user-1" }),
  );
});

test.each<[string, UIMessage[]]>([
  ["an empty submission", []],
  [
    "a final assistant message",
    [{ id: "a-1", role: "assistant", parts: [{ type: "text", text: "hi" }] }],
  ],
  [
    "a final user message without text",
    [{ id: "u-1", role: "user", parts: [] }],
  ],
])("refuses %s before admission", async (_label, messages) => {
  const { client, send } = clientWith(completedEvents);
  const transport = createFlueChatTransport({
    client,
    clientToolNames: new Set(),
  });

  await expect(transport.sendMessages(sendOptions(messages))).rejects.toThrow(
    "The submitted user message has no text.",
  );
  expect(send).not.toHaveBeenCalled();
});

test("derives the same idempotency key for exact AI SDK retries", async () => {
  const { client, send } = clientWith(completedEvents);
  const transport = createFlueChatTransport({
    client,
    clientToolNames: new Set(),
  });
  const options = sendOptions([
    {
      id: "stable-user-message",
      role: "user",
      parts: [{ type: "text", text: "Admit this once." }],
    },
  ]);

  await transport.sendMessages(options);
  await transport.sendMessages(options);

  expect(send).toHaveBeenCalledTimes(2);
  expect(send.mock.calls.map(([input]) => input.idempotencyKey)).toEqual([
    "ai-sdk:user:stable-user-message",
    "ai-sdk:user:stable-user-message",
  ]);
});

test("starts with history-only reconnection", async () => {
  const { client } = clientWith([]);
  const transport = createFlueChatTransport({
    client,
    clientToolNames: new Set(),
  });

  await expect(
    transport.reconnectToStream({ chatId: "conversation-1" }),
  ).resolves.toBeNull();
});

test.each([
  [
    "failed",
    new FlueExecutionError({
      target: "agent_submission",
      targetId: admission.submissionId,
      failure: "failed",
    }),
    expect.objectContaining({ type: "error" }),
  ],
  [
    "aborted",
    new FlueExecutionError({
      target: "agent_submission",
      targetId: admission.submissionId,
      failure: "aborted",
    }),
    { type: "abort", reason: "The chat turn was stopped." },
  ],
])(
  "maps a settled %s wait rejection into the finite UI stream",
  async (_label, waitError, expected) => {
    const send = vi.fn<FlueClient["send"]>(async () => admission);
    const wait = vi.fn<FlueClient["wait"]>(async () => {
      throw waitError;
    });
    const transport = createFlueChatTransport({
      client: { send, wait } as Pick<FlueClient, "send" | "wait"> as FlueClient,
      clientToolNames: new Set(),
    });

    const stream = await transport.sendMessages(
      sendOptions([
        {
          id: "user-1",
          role: "user",
          parts: [{ type: "text", text: "Map the outcome." }],
        },
      ]),
    );

    expect(await readChunks(stream)).toEqual([expected]);
    expect(wait).toHaveBeenCalledOnce();
  },
);

test.each([
  ["a refused reconnect", refusedReconnect(410)],
  [
    "a stream that ends before the turn settles",
    new FlueExecutionError({
      target: "agent_submission",
      targetId: admission.submissionId,
      failure: "terminal_event_missing",
    }),
  ],
  ["an unclassified wait failure", new Error("The stream broke.")],
])(
  "fails the stream as an AI SDK disconnect once re-attaching gives up on %s",
  async (_label, waitError) => {
    vi.useFakeTimers();
    const send = vi.fn<FlueClient["send"]>(async () => admission);
    const wait = vi.fn<FlueClient["wait"]>(async () => {
      throw waitError;
    });
    const onReattach =
      vi.fn<NonNullable<FlueChatTransportOptions["onReattach"]>>();
    const transport = createFlueChatTransport({
      client: { send, wait } as Pick<FlueClient, "send" | "wait"> as FlueClient,
      clientToolNames: new Set(),
      onReattach,
    });

    const stream = await transport.sendMessages(
      sendOptions([
        {
          id: "user-1",
          role: "user",
          parts: [{ type: "text", text: "Lose the stream." }],
        },
      ]),
    );
    const reading = readChunks(stream);
    reading.catch(() => {});
    await vi.runAllTimersAsync();
    vi.useRealTimers();

    const failure = await reading.then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(FlueChatDisconnectError);
    expect(failure).toBeInstanceOf(TypeError);
    expect(failure).toMatchObject({
      submissionId: admission.submissionId,
      cause: waitError,
    });
    expect(wait).toHaveBeenCalledTimes(4);
    expect(
      onReattach.mock.calls.map(([event]) => [event.attempt, event.delayMs]),
    ).toEqual([
      [1, 250],
      [2, 500],
      [3, 1000],
    ]);
  },
);

test("re-attaches after the update stream fails, projecting each chunk once", async () => {
  vi.useFakeTimers();
  const send = vi.fn<FlueClient["send"]>(async () => admission);
  const wait = vi.fn<FlueClient["wait"]>(async (_admission, options) => {
    const replayed = wait.mock.calls.length === 1 ? 2 : completedEvents.length;
    for (const event of completedEvents.slice(0, replayed)) {
      // eslint-disable-next-line no-await-in-loop
      await options?.onEvent?.(event);
    }
    if (replayed < completedEvents.length) throw refusedReconnect(410);
  });
  const onResponseMessage =
    vi.fn<NonNullable<FlueChatTransportOptions["onResponseMessage"]>>();
  const onResponseMessageCompleted =
    vi.fn<
      NonNullable<FlueChatTransportOptions["onResponseMessageCompleted"]>
    >();
  const onReattach =
    vi.fn<NonNullable<FlueChatTransportOptions["onReattach"]>>();
  const transport = createFlueChatTransport({
    client: { send, wait } as Pick<FlueClient, "send" | "wait"> as FlueClient,
    clientToolNames: new Set(),
    onReattach,
    onResponseMessage,
    onResponseMessageCompleted,
  });

  const stream = await transport.sendMessages(
    sendOptions([
      {
        id: "user-1",
        role: "user",
        parts: [{ type: "text", text: "Survive a refused reconnect." }],
      },
    ]),
  );
  const reading = readChunks(stream);
  await vi.runAllTimersAsync();
  vi.useRealTimers();

  expect((await reading).map((chunk) => chunk.type)).toEqual([
    "start",
    "start-step",
    "text-start",
    "text-delta",
    "text-end",
    "finish-step",
    "finish",
  ]);
  expect(wait).toHaveBeenCalledTimes(2);
  expect(onReattach).toHaveBeenCalledOnce();
  expect(onReattach.mock.calls[0]?.[0]).toMatchObject({
    submissionId: admission.submissionId,
    attempt: 1,
    delayMs: 250,
    error: { status: 410 },
  });
  expect(onResponseMessage).toHaveBeenCalledOnce();
  expect(onResponseMessageCompleted).toHaveBeenCalledOnce();
});

test("a live tool call survives its live channel and update stream dropping together", async () => {
  let liveBody: ReadableStreamDefaultController<Uint8Array> | undefined;
  const liveStart = {
    v: 1,
    kind: "tool-input-start",
    sequence: 0,
    instanceId: "instance-1",
    submissionId: admission.submissionId,
    turnId: "turn-1",
    toolCallId: "call-1",
    toolName: "render_widget",
  };
  const liveFetch: typeof fetch = async () =>
    new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          liveBody = controller;
          controller.enqueue(
            new TextEncoder().encode(`data: ${JSON.stringify(liveStart)}\n\n`),
          );
        },
      }),
    );
  const events: readonly ConversationStreamChunk[] = [
    {
      type: "message-started",
      conversationId: "conversation-1",
      messageId: "assistant-1",
      submissionId: admission.submissionId,
      turnId: "turn-1",
      position: position(0),
    },
    {
      type: "tool-input",
      conversationId: "conversation-1",
      messageId: "assistant-1",
      toolCallId: "call-1",
      toolName: "render_widget",
      input: {},
      position: position(1),
    },
    {
      type: "message-completed",
      conversationId: "conversation-1",
      messageId: "assistant-1",
      position: position(2),
    },
    {
      type: "submission-settled",
      conversationId: "conversation-1",
      submissionId: admission.submissionId,
      outcome: "completed",
      position: position(3),
    },
  ];
  const send = vi.fn<FlueClient["send"]>(async () => admission);
  const wait = vi.fn<FlueClient["wait"]>(async (_admission, options) => {
    if (wait.mock.calls.length === 1) {
      await new Promise((resolve) => {
        setTimeout(resolve, 30);
      });
      liveBody?.error(new TypeError("terminated"));
      throw refusedReconnect(410);
    }
    // eslint-disable-next-line no-await-in-loop
    for (const event of events) await options?.onEvent?.(event);
  });
  const transport = createFlueChatTransport({
    client: {
      url: "http://agent.test/conversation",
      send,
      wait,
    } as Pick<FlueClient, "url" | "send" | "wait"> as FlueClient,
    clientToolNames: new Set(["render_widget"]),
    liveToolStream: { fetch: liveFetch, headers: {} },
  });

  const chunks = await readChunks(
    await transport.sendMessages(
      sendOptions([
        {
          id: "user-1",
          role: "user",
          parts: [{ type: "text", text: "Show a widget." }],
        },
      ]),
    ),
  );

  expect(
    chunks.filter((chunk) => "toolCallId" in chunk).map((chunk) => chunk.type),
  ).toEqual(["tool-input-start", "tool-input-available"]);
  expect(wait).toHaveBeenCalledTimes(2);
});

test.each([401, 403])(
  "does not re-attach after Flue's SDK has spent its own %i retries",
  async (status) => {
    const refusal = refusedReconnect(status);
    const send = vi.fn<FlueClient["send"]>(async () => admission);
    const wait = vi.fn<FlueClient["wait"]>(async () => {
      throw refusal;
    });
    const onReattach =
      vi.fn<NonNullable<FlueChatTransportOptions["onReattach"]>>();
    const transport = createFlueChatTransport({
      client: { send, wait } as Pick<FlueClient, "send" | "wait"> as FlueClient,
      clientToolNames: new Set(),
      onReattach,
    });

    const reading = readChunks(
      await transport.sendMessages(
        sendOptions([
          {
            id: "user-1",
            role: "user",
            parts: [{ type: "text", text: "Unauthorized." }],
          },
        ]),
      ),
    );

    await expect(reading).rejects.toBeInstanceOf(FlueChatDisconnectError);
    await expect(reading).rejects.toMatchObject({ cause: refusal });
    expect(wait).toHaveBeenCalledOnce();
    expect(onReattach).not.toHaveBeenCalled();
  },
);

test("makes no further wait() call when stopped during a re-attach pause", async () => {
  const abortController = new AbortController();
  const send = vi.fn<FlueClient["send"]>(async () => admission);
  const wait = vi.fn<FlueClient["wait"]>(async () => {
    throw refusedReconnect(410);
  });
  const transport = createFlueChatTransport({
    client: { send, wait } as Pick<FlueClient, "send" | "wait"> as FlueClient,
    clientToolNames: new Set(),
  });
  const stream = await transport.sendMessages({
    ...sendOptions([
      {
        id: "user-1",
        role: "user",
        parts: [{ type: "text", text: "Stop while paused." }],
      },
    ]),
    abortSignal: abortController.signal,
  });
  const reading = readChunks(stream);
  await vi.waitFor(() => expect(wait).toHaveBeenCalledOnce());

  abortController.abort();

  await expect(reading).resolves.toEqual([
    { type: "abort", reason: "The local chat stream was cancelled." },
  ]);
  expect(wait).toHaveBeenCalledOnce();
});

test("does not re-attach after its own projection fails", async () => {
  const { client, wait } = clientWith(completedEvents);
  const transport = createFlueChatTransport({
    client,
    clientToolNames: new Set(),
    onResponseMessage: () => {
      throw new Error("The host rejected the response message.");
    },
  });

  const stream = await transport.sendMessages(
    sendOptions([
      {
        id: "user-1",
        role: "user",
        parts: [{ type: "text", text: "Fail in projection." }],
      },
    ]),
  );

  expect(await readChunks(stream)).toContainEqual({
    type: "error",
    errorText: "The host rejected the response message.",
  });
  expect(wait).toHaveBeenCalledOnce();
});

test("keeps caller cancellation distinct from durable abort", async () => {
  const abortController = new AbortController();
  const send = vi.fn<FlueClient["send"]>(async () => admission);
  const wait = vi.fn<FlueClient["wait"]>(
    async (_admission, options) =>
      new Promise<void>((_resolve, reject) => {
        options?.signal?.addEventListener(
          "abort",
          () => reject(new DOMException("cancelled", "AbortError")),
          { once: true },
        );
      }),
  );
  const transport = createFlueChatTransport({
    client: { send, wait } as Pick<FlueClient, "send" | "wait"> as FlueClient,
    clientToolNames: new Set(),
  });
  const stream = await transport.sendMessages({
    ...sendOptions([
      {
        id: "user-1",
        role: "user",
        parts: [{ type: "text", text: "Cancel only this observer." }],
      },
    ]),
    abortSignal: abortController.signal,
  });

  abortController.abort();

  await expect(readChunks(stream)).resolves.toEqual([
    { type: "abort", reason: "The local chat stream was cancelled." },
  ]);
});

test("classifies documented rejection and ambiguous admission without retrying", async () => {
  const rejectedSend = vi.fn<FlueClient["send"]>(async () => {
    throw new FlueApiError(403, "");
  });
  const ambiguousSend = vi.fn<FlueClient["send"]>(async () => {
    throw new TypeError("connection lost after request write");
  });
  const createTransport = (send: FlueClient["send"]) =>
    createFlueChatTransport({
      client: { send } as Pick<FlueClient, "send"> as FlueClient,
      clientToolNames: new Set(),
    });
  const options = sendOptions([
    {
      id: "user-1",
      role: "user",
      parts: [{ type: "text", text: "Admit once." }],
    },
  ]);

  await expect(
    createTransport(rejectedSend).sendMessages(options),
  ).rejects.toMatchObject({
    failure: { kind: "rejected", status: 403 },
    message: "The agent rejected the message before admission (HTTP 403).",
    name: "FlueChatAdmissionError",
  });
  await expect(
    createTransport(ambiguousSend).sendMessages(options),
  ).rejects.toMatchObject({
    failure: { kind: "ambiguous" },
    message:
      "The agent may have accepted the message, but admission could not be confirmed. Reopen the conversation before trying again.",
    name: "FlueChatAdmissionError",
  });
  expect(rejectedSend).toHaveBeenCalledOnce();
  expect(ambiguousSend).toHaveBeenCalledOnce();
});

test.each([
  ["server failure", new FlueApiError(500, "")],
  ["unknown response", new FlueApiError(418, "")],
] as const)(
  "treats a %s after request write as ambiguous",
  async (_label, error) => {
    const send = vi.fn<FlueClient["send"]>(async () => {
      throw error;
    });
    const transport = createFlueChatTransport({
      client: { send } as Pick<FlueClient, "send"> as FlueClient,
      clientToolNames: new Set(),
    });

    await expect(
      transport.sendMessages(
        sendOptions([
          {
            id: "user-ambiguous",
            role: "user",
            parts: [{ type: "text", text: "Do not retry this." }],
          },
        ]),
      ),
    ).rejects.toMatchObject({
      failure: { kind: "ambiguous" },
      name: "FlueChatAdmissionError",
    });
    expect(send).toHaveBeenCalledOnce();
  },
);

test("classifies an explicit local admission abort without retrying", async () => {
  const send = vi.fn<FlueClient["send"]>(async () => {
    throw new DOMException("cancelled", "AbortError");
  });
  const transport = createFlueChatTransport({
    client: { send } as Pick<FlueClient, "send"> as FlueClient,
    clientToolNames: new Set(),
  });

  await expect(
    transport.sendMessages(
      sendOptions([
        {
          id: "user-aborted",
          role: "user",
          parts: [{ type: "text", text: "Cancel locally." }],
        },
      ]),
    ),
  ).rejects.toMatchObject({
    failure: { kind: "aborted" },
    name: "FlueChatAdmissionError",
  });
  expect(send).toHaveBeenCalledOnce();
});

test("reports one admission and its correlated response message completion", async () => {
  const { client } = clientWith(completedEvents);
  const onAdmission =
    vi.fn<NonNullable<FlueChatTransportOptions["onAdmission"]>>();
  const onResponseMessage =
    vi.fn<NonNullable<FlueChatTransportOptions["onResponseMessage"]>>();
  const onResponseMessageCompleted =
    vi.fn<
      NonNullable<FlueChatTransportOptions["onResponseMessageCompleted"]>
    >();
  const transport = createFlueChatTransport({
    client,
    clientToolNames: new Set(),
    onAdmission,
    onResponseMessage,
    onResponseMessageCompleted,
  });

  const stream = await transport.sendMessages(
    sendOptions([
      {
        id: "user-1",
        role: "user",
        parts: [{ type: "text", text: "Track this response." }],
      },
    ]),
  );
  await readChunks(stream);

  expect(onAdmission).toHaveBeenCalledOnce();
  expect(onAdmission).toHaveBeenCalledWith({
    admission,
    kind: "user",
    messageId: "user-1",
  });
  expect(onResponseMessage).toHaveBeenCalledOnce();
  expect(onResponseMessage).toHaveBeenCalledWith({
    messageId: "assistant-1",
    position: position(0),
    submissionId: admission.submissionId,
  });
  expect(onResponseMessageCompleted).toHaveBeenCalledOnce();
  expect(onResponseMessageCompleted).toHaveBeenCalledWith({
    messageId: "assistant-1",
    position: position(2),
    submissionId: admission.submissionId,
  });
});

test("stays silent after the consumer cancels the per-turn stream", async () => {
  let waitSignal: AbortSignal | undefined;
  const send = vi.fn<FlueClient["send"]>(async () => admission);
  const wait = vi.fn<FlueClient["wait"]>(
    async (_admission, options) =>
      new Promise<void>((_resolve, reject) => {
        waitSignal = options?.signal;
        options?.signal?.addEventListener(
          "abort",
          () => reject(new DOMException("cancelled", "AbortError")),
          { once: true },
        );
      }),
  );
  const transport = createFlueChatTransport({
    client: { send, wait } as Pick<FlueClient, "send" | "wait"> as FlueClient,
    clientToolNames: new Set(),
  });
  const stream = await transport.sendMessages(
    sendOptions([
      {
        id: "user-1",
        role: "user",
        parts: [{ type: "text", text: "Cancel from the reader." }],
      },
    ]),
  );

  const reader = stream.getReader();
  await reader.cancel();
  // Let the rejected `wait()` settle; an enqueue on the cancelled controller
  // would surface here as an unhandled rejection.
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(waitSignal?.aborted).toBe(true);
  await expect(reader.closed).resolves.toBeUndefined();
});

test("replays a stable typed or Voice message with the same idempotency key", async () => {
  const seenKeys = new Set<string>();
  let admittedTurns = 0;
  const send = vi.fn<FlueClient["send"]>(async (options) => {
    const key = options.idempotencyKey;
    if (key === undefined || !seenKeys.has(key)) {
      admittedTurns += 1;
      if (key !== undefined) seenKeys.add(key);
      return admission;
    }
    return { ...admission, deduplicated: true };
  });
  const wait = vi.fn<FlueClient["wait"]>(async () => undefined);
  const onAdmission =
    vi.fn<NonNullable<FlueChatTransportOptions["onAdmission"]>>();
  const transport = createFlueChatTransport({
    client: { send, wait } as Pick<FlueClient, "send" | "wait"> as FlueClient,
    clientToolNames: new Set(),
    onAdmission,
  });
  const typedTurn = sendOptions([
    {
      id: "typed-message-1",
      role: "user",
      parts: [{ type: "text", text: "Admit this once." }],
    },
  ]);

  const firstStream = await transport.sendMessages(typedTurn);
  const replayedStream = await transport.sendMessages(typedTurn);
  await Promise.all([readChunks(firstStream), readChunks(replayedStream)]);

  expect(send).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({ idempotencyKey: "ai-sdk:user:typed-message-1" }),
  );
  expect(send).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({ idempotencyKey: "ai-sdk:user:typed-message-1" }),
  );
  expect(admittedTurns).toBe(1);
  expect(onAdmission).toHaveBeenNthCalledWith(2, {
    admission: { ...admission, deduplicated: true },
    kind: "user",
    messageId: "typed-message-1",
  });

  const voiceTurn = sendOptions([
    {
      id: "voice-realtime:7:item%2F1:0",
      role: "user",
      parts: [{ type: "text", text: "Voice transcript." }],
    },
  ]);
  await readChunks(await transport.sendMessages(voiceTurn));
  expect(send).toHaveBeenLastCalledWith(
    expect.objectContaining({
      idempotencyKey: "ai-sdk:user:voice-realtime:7:item%2F1:0",
    }),
  );
});

test("reports an idempotency conflict as a definite existing admission", async () => {
  const send = vi.fn<FlueClient["send"]>(async () => {
    throw new FlueApiError(409, {
      error: {
        details: "",
        message: "The delivery key already names another payload.",
        meta: { submissionId: "submission-existing" },
        type: "submission_conflict",
      },
    });
  });
  const transport = createFlueChatTransport({
    client: { send } as Pick<FlueClient, "send"> as FlueClient,
    clientToolNames: new Set(),
  });

  await expect(
    transport.sendMessages(
      sendOptions([
        {
          id: "user-conflict",
          role: "user",
          parts: [{ type: "text", text: "Changed payload." }],
        },
      ]),
    ),
  ).rejects.toMatchObject({
    failure: {
      kind: "submission-conflict",
      status: 409,
      submissionId: "submission-existing",
    },
    message:
      "The delivery key already belongs to admitted submission submission-existing; the changed payload was not admitted.",
    name: "FlueChatAdmissionError",
  });
  expect(send).toHaveBeenCalledOnce();
});
