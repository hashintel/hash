import { FlueApiError, FlueExecutionError } from "@flue/sdk";
import { expect, test, vi } from "vitest";

import { createFlueChatTransport } from "../src";

import type { FlueChatTransportOptions } from "../src";
import type {
  AgentSendResult,
  ConversationStreamChunk,
  FlueClient,
} from "@flue/sdk";
import type { ChatTransport, UIMessage, UIMessageChunk } from "ai";

const admission: AgentSendResult = {
  streamUrl: "http://brunch.test/stream",
  offset: "offset-1",
  submissionId: "submission-1",
  uid: "uid-1",
};

const position = (index: number) => ({ batch: 1, index });

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
  };
};

const readChunks = async (
  stream: ReadableStream<UIMessageChunk>,
): Promise<UIMessageChunk[]> => {
  const chunks: UIMessageChunk[] = [];
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
    clientToolNames: new Set(["readPetrinautDoc"]),
    clientToolResultSignal: "client-tool-result",
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

test("admits one client-tool result signal and resumes its assistant id", async () => {
  const { client, send } = clientWith(completedEvents);
  const transport = createFlueChatTransport({
    client,
    clientToolNames: new Set(["readPetrinautDoc"]),
    clientToolResultSignal: "client-tool-result",
  });

  const stream = await transport.sendMessages(
    sendOptions(
      [
        {
          id: "assistant-original",
          role: "assistant",
          parts: [
            {
              type: "dynamic-tool",
              toolName: "readPetrinautDoc",
              toolCallId: "tool-1",
              state: "output-available",
              input: { doc: "ai-assistant" },
              output: "The guide.",
            },
          ],
        },
      ],
      "assistant-original",
    ),
  );

  expect(send).toHaveBeenCalledWith({
    message: {
      kind: "signal",
      type: "client-tool-result",
      tagName: "client-tool-result",
      body: JSON.stringify([
        {
          toolCallId: "tool-1",
          toolName: "readPetrinautDoc",
          output: "The guide.",
        },
      ]),
      attributes: { toolCallIds: "tool-1" },
    },
    signal: undefined,
  });
  expect((await readChunks(stream))[0]).toEqual({
    type: "start",
    messageId: "assistant-original",
  });
});

test("starts with history-only reconnection", async () => {
  const { client } = clientWith([]);
  const transport = createFlueChatTransport({
    client,
    clientToolNames: new Set(),
    clientToolResultSignal: "client-tool-result",
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
    { type: "error", errorText: "The chat turn failed." },
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
  [
    "missing terminal event",
    new FlueExecutionError({
      target: "agent_submission",
      targetId: admission.submissionId,
      failure: "terminal_event_missing",
    }),
    {
      type: "error",
      errorText: "The chat stream ended before the turn settled.",
    },
  ],
])(
  "maps a %s wait rejection into the finite UI stream",
  async (_label, waitError, expected) => {
    const send = vi.fn<FlueClient["send"]>(async () => admission);
    const wait = vi.fn<FlueClient["wait"]>(async () => {
      throw waitError;
    });
    const transport = createFlueChatTransport({
      client: { send, wait } as Pick<FlueClient, "send" | "wait"> as FlueClient,
      clientToolNames: new Set(),
      clientToolResultSignal: "client-tool-result",
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
  },
);

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
    clientToolResultSignal: "client-tool-result",
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

test("surfaces rejected and ambiguous admission without retrying", async () => {
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
      clientToolResultSignal: "client-tool-result",
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
  ).rejects.toThrow("rejected the message before admission (HTTP 403)");
  await expect(
    createTransport(ambiguousSend).sendMessages(options),
  ).rejects.toThrow("may have accepted the message");
  expect(rejectedSend).toHaveBeenCalledOnce();
  expect(ambiguousSend).toHaveBeenCalledOnce();
});

test("reports one admission and its correlated response message", async () => {
  const { client } = clientWith(completedEvents);
  const onAdmission =
    vi.fn<NonNullable<FlueChatTransportOptions["onAdmission"]>>();
  const onResponseMessage =
    vi.fn<NonNullable<FlueChatTransportOptions["onResponseMessage"]>>();
  const transport = createFlueChatTransport({
    client,
    clientToolNames: new Set(),
    clientToolResultSignal: "client-tool-result",
    onAdmission,
    onResponseMessage,
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
    submissionId: admission.submissionId,
  });
});
