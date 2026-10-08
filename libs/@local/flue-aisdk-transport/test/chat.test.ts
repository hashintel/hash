/**
 * The transport under the AI SDK's own `AbstractChat` (ai@6.0.286), against a
 * real in-process Flue conversation. Each `describe` names the case of
 * `packages/ai/src/ui/chat.test.ts` (or `process-ui-message-stream.test.ts`)
 * it corresponds to; each test is labelled a guarantee, an observed behaviour
 * or a decision, as in `upstream-reducer-cases.test.ts`.
 */
import {
  fauxAssistantMessage,
  fauxText,
  fauxToolCall,
} from "@earendil-works/pi-ai";
import { createFlueClient } from "@flue/sdk";
import { lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import { afterAll, describe, expect, test, vi } from "vitest";

import {
  createFlueAiSdkAdapter,
  createFlueUiStream,
  FlueChatDisconnectError,
} from "../src/client";
import { reduceUiMessageChunks, useUiChunkRecorder } from "./ai-sdk-oracle";
import {
  harnessAdapterConfig,
  harnessTools,
  startFlueHarness,
  withoutLiveOnlyDetails,
} from "./flue-harness";
import { TestChat } from "./test-chat";

import type { FlueChatTransportOptions } from "../src/client";
import type {
  AgentSendResult,
  ConversationStreamChunk,
  FlueClient,
} from "@flue/sdk";
import type { ChatInit, ChatTransport, UIMessage, UIMessageChunk } from "ai";

const position = (index: number) => ({ batch: 1, index });

const clientToolStepThenAbort: readonly ConversationStreamChunk[] = [
  {
    type: "message-started",
    conversationId: "conversation-1",
    messageId: "message-1",
    submissionId: "submission-1",
    turnId: "turn-1",
    position: position(0),
  },
  {
    type: "tool-input",
    conversationId: "conversation-1",
    messageId: "message-1",
    toolCallId: "call-1",
    toolName: harnessTools.widget,
    input: { title: "t" },
    position: position(1),
  },
  {
    type: "message-completed",
    conversationId: "conversation-1",
    messageId: "message-1",
    position: position(2),
  },
  {
    type: "tool-output",
    conversationId: "conversation-1",
    toolCallId: "call-1",
    output: { hostEnvelope: true, output: { shown: "t" } },
    position: position(3),
  },
  {
    type: "submission-settled",
    conversationId: "conversation-1",
    submissionId: "submission-1",
    outcome: "aborted",
    position: position(4),
  },
];

const harness = await startFlueHarness();
afterAll(() => harness.stop());

const recordChunks = useUiChunkRecorder();

/** Every stream the chat consumes is also checked against the AI SDK. */
const recorded = (
  transport: ChatTransport<UIMessage>,
): ChatTransport<UIMessage> => ({
  ...transport,
  sendMessages: async (options) => {
    const chunks = recordChunks();
    return (await transport.sendMessages(options)).pipeThrough(
      new TransformStream<UIMessageChunk, UIMessageChunk>({
        transform(chunk, controller) {
          chunks.push(chunk);
          controller.enqueue(chunk);
        },
      }),
    );
  },
});

const createChat = (
  options: {
    readonly client?: FlueClient;
    readonly transport?: Partial<FlueChatTransportOptions>;
  } & Omit<ChatInit<UIMessage>, "transport"> = {},
) => {
  const client = options.client ?? harness.client();
  const admissions: AgentSendResult[] = [];
  const transport = recorded(
    createFlueAiSdkAdapter(harnessAdapterConfig).chatTransport({
      client,
      onAdmission: ({ admission }) => admissions.push(admission),
      ...options.transport,
    }),
  );
  const sendMessages = vi.spyOn(transport, "sendMessages");
  const onFinish = vi.fn<NonNullable<ChatInit<UIMessage>["onFinish"]>>();
  const onError = vi.fn<NonNullable<ChatInit<UIMessage>["onError"]>>();
  const chat = new TestChat({ ...options, transport, onFinish, onError });
  return { admissions, chat, client, onError, onFinish, sendMessages };
};

describe("upstream: 'send a simple message'", () => {
  test("guarantee: a completed turn leaves the chat ready with one assistant message", async () => {
    harness.script([fauxAssistantMessage([fauxText("Hello.")])]);
    const { chat, onFinish } = createChat();

    await chat.sendMessage({ text: "Hi" });

    expect(chat.status).toBe("ready");
    expect(chat.statuses).toEqual(["submitted", "streaming", "ready"]);
    expect(chat.messages.map(({ role }) => role)).toEqual([
      "user",
      "assistant",
    ]);
    expect(onFinish).toHaveBeenCalledWith(
      expect.objectContaining({
        isAbort: false,
        isError: false,
        finishReason: "stop",
      }),
    );
  });
});

describe("upstream: 'should handle error parts'", () => {
  test("guarantee: a failed submission's error chunk puts the chat in error with the server's text", async () => {
    harness.script([
      fauxAssistantMessage([], {
        stopReason: "error",
        errorMessage: "The provider is unavailable.",
      }),
    ]);
    const { chat, onError } = createChat();

    await chat.sendMessage({ text: "Fail" });

    expect(chat.status).toBe("error");
    expect(chat.error?.message).toContain("The provider is unavailable.");
    expect(onError).toHaveBeenCalledOnce();
  });
});

describe("upstream: 'send handle a disconnected response stream'", () => {
  // Upstream's disconnect errors the HTTP stream. Flue's SDK retries a dropped
  // update stream and the transport re-attaches when the SDK gives up, so only
  // a transport that gives up as well reports a disconnect.
  test("observed: a dropped Flue update stream is retried, and the turn still completes", async () => {
    harness.script([fauxAssistantMessage([fauxText("Recovered.")])]);
    let admitted = false;
    let failures = 0;
    const client = createFlueClient({
      url: `http://flue.test/${crypto.randomUUID()}`,
      fetch: async (input, init) => {
        const request = new Request(input, init);
        if (admitted && request.method === "GET" && failures < 2) {
          failures += 1;
          throw new TypeError("fetch failed");
        }
        const response = await harness.fetch(request);
        if (request.method === "POST") admitted = true;
        return response;
      },
    });
    const { chat, onFinish } = createChat({ client });

    await chat.sendMessage({ text: "Hi" });

    expect(failures).toBe(2);
    expect(chat.status).toBe("ready");
    expect(chat.messages.at(-1)?.parts).toContainEqual(
      expect.objectContaining({ type: "text", text: "Recovered." }),
    );
    expect(onFinish).toHaveBeenCalledWith(
      expect.objectContaining({ isDisconnect: false, isError: false }),
    );
  });

  // Flue's SDK gives up on a reconnect refused with a 4xx other than 401, 403
  // or 416, which would leave the submission running with nobody reading it.
  test("decision: a refused reconnect re-attaches, and the turn completes with each part once", async () => {
    const { client, cut, refused } = harness.cuttableClient();
    harness.script([
      fauxAssistantMessage(
        [fauxToolCall(harnessTools.lookup, { q: "before" })],
        { stopReason: "toolUse" },
      ),
      () => {
        cut(410, 1);
        return fauxAssistantMessage([fauxText("Recovered.")]);
      },
    ]);
    const { chat, onFinish } = createChat({ client });

    await chat.sendMessage({ text: "Look it up" });

    expect(refused()).toBe(1);
    expect(chat.error).toBeUndefined();
    expect(chat.status).toBe("ready");
    expect(onFinish).toHaveBeenCalledWith(
      expect.objectContaining({ isDisconnect: false, isError: false }),
    );
    const reopened = createFlueAiSdkAdapter(harnessAdapterConfig).reopen(
      await client.history(),
    );
    expect(withoutLiveOnlyDetails(chat.messages.at(-1))).toEqual(
      reopened.at(-1),
    );
  });

  test("decision: when re-attaching gives up, the chat reports the AI SDK's disconnect", async () => {
    const { client, cut, refused } = harness.cuttableClient();
    harness.script([
      () => {
        cut(410, 10);
        return fauxAssistantMessage([fauxText("Unseen.")]);
      },
    ]);
    const onReattach =
      vi.fn<NonNullable<FlueChatTransportOptions["onReattach"]>>();
    const { admissions, chat, onError, onFinish } = createChat({
      client,
      transport: { onReattach },
    });

    await chat.sendMessage({ text: "Hi" });

    expect(refused()).toBe(4);
    expect(onReattach).toHaveBeenCalledTimes(3);
    expect(chat.status).toBe("error");
    expect(chat.error).toBeInstanceOf(FlueChatDisconnectError);
    expect(chat.error).toMatchObject({
      submissionId: admissions.at(0)?.submissionId,
    });
    expect(onError).toHaveBeenCalledExactlyOnceWith(chat.error);
    expect(onFinish).toHaveBeenCalledWith(
      expect.objectContaining({ isDisconnect: true, isError: true }),
    );
  });
});

describe("upstream: 'send handle a stop and an aborted response stream'", () => {
  test("decision: stopping the chat ends only the local observer; the Flue turn completes", async () => {
    const release = Promise.withResolvers<void>();
    harness.script([
      async () => {
        await release.promise;
        return fauxAssistantMessage([fauxText("Finished anyway.")]);
      },
    ]);
    const { admissions, chat, client, onFinish } = createChat();

    const sending = chat.sendMessage({ text: "Slow" });
    await vi.waitFor(() => expect(admissions).toHaveLength(1));
    await chat.stop();
    await sending;
    release.resolve();

    expect(chat.status).toBe("ready");
    expect(onFinish).toHaveBeenCalledWith(
      expect.objectContaining({ isAbort: true, isError: false }),
    );
    const [admission] = admissions;
    if (admission === undefined) throw new Error("Expected one admission.");
    await client.wait(admission);
    const history = await client.history();
    expect(history.settlements.at(-1)).toMatchObject({ outcome: "completed" });
  });

  test("decision: a durable Flue abort ends the turn with an abort chunk, which the AI SDK does not report as an abort", async () => {
    const release = Promise.withResolvers<void>();
    harness.script([
      async () => {
        await release.promise;
        return fauxAssistantMessage([fauxText("Too late.")]);
      },
    ]);
    const { admissions, chat, client, onFinish } = createChat();

    const sending = chat.sendMessage({ text: "Slow" });
    await vi.waitFor(() => expect(admissions).toHaveLength(1));
    await client.abort();
    release.resolve();
    await sending;

    expect(chat.status).toBe("ready");
    expect(onFinish).toHaveBeenCalledWith(
      expect.objectContaining({ isAbort: false, isError: false }),
    );
  });
});

describe("upstream: 'sendAutomaticallyWhen'", () => {
  const scriptClientTool = () =>
    harness.script([
      fauxAssistantMessage(
        [fauxToolCall(harnessTools.widget, { title: "t" })],
        {
          stopReason: "toolUse",
        },
      ),
      fauxAssistantMessage([fauxText("Shown.")]),
      fauxAssistantMessage([fauxText("Unexpected follow-up.")]),
    ]);

  test("observed: an in-band client tool result does not trigger an automatic follow-up", async () => {
    scriptClientTool();
    const { chat, sendMessages } = createChat({
      sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    });

    await chat.sendMessage({ text: "Show" });

    expect(sendMessages).toHaveBeenCalledOnce();
    expect(chat.status).toBe("ready");
  });

  // Flue always opens another step after a tool result, so only a turn that
  // ends on a settled client-tool step (such as a durable stop right after a
  // browser result) reaches the predicate with that step last.
  test("observed: a turn ending on a settled client-tool step does not satisfy the continuation predicate", async () => {
    const written: UIMessageChunk[] = [];
    const projector = createFlueUiStream({
      submissionId: "submission-1",
      ...harnessAdapterConfig,
      write: (chunk) => written.push(chunk),
    });
    for (const chunk of clientToolStepThenAbort) projector.accept(chunk);
    const { message } = await reduceUiMessageChunks(written);
    if (message === undefined) throw new Error("Expected a reduced message.");
    const withoutProviderExecution = structuredClone(message);
    for (const part of withoutProviderExecution.parts) {
      if ("providerExecuted" in part) part.providerExecuted = undefined;
    }

    expect(
      lastAssistantMessageIsCompleteWithToolCalls({ messages: [message] }),
    ).toBe(false);
    expect(
      lastAssistantMessageIsCompleteWithToolCalls({
        messages: [withoutProviderExecution],
      }),
    ).toBe(true);
  });
});

describe("upstream: 'onToolCall is executed' (process-ui-message-stream)", () => {
  test("observed: onToolCall runs for a client tool but not for a Flue-executed server tool", async () => {
    harness.script([
      fauxAssistantMessage(
        [
          fauxToolCall(harnessTools.lookup, { q: "x" }),
          fauxToolCall(harnessTools.widget, { title: "t" }),
        ],
        { stopReason: "toolUse" },
      ),
      fauxAssistantMessage([fauxText("Done.")]),
    ]);
    const onToolCall = vi.fn<NonNullable<ChatInit<UIMessage>["onToolCall"]>>();
    const { chat } = createChat({ onToolCall });

    await chat.sendMessage({ text: "Both" });

    expect(
      onToolCall.mock.calls.map(([{ toolCall }]) => toolCall.toolName),
    ).toEqual([harnessTools.widget]);
  });
});

describe("upstream: 'regenerate'", () => {
  test("decision: regenerating a Flue conversation is refused", async () => {
    harness.script([fauxAssistantMessage([fauxText("Once.")])]);
    const { chat } = createChat();
    await chat.sendMessage({ text: "Hi" });

    await chat.regenerate();

    expect(chat.status).toBe("error");
    expect(chat.error?.message).toBe(
      "Regenerating a Flue conversation is not supported.",
    );
  });
});

describe("upstream: 'resumeStream'", () => {
  test("decision: resuming finds no stream, so reopened history is the only recovery", async () => {
    const { chat, sendMessages } = createChat();

    await chat.resumeStream();

    expect(chat.status).toBe("ready");
    expect(chat.statuses).toEqual([]);
    expect(sendMessages).not.toHaveBeenCalled();
  });
});
