/**
 * The transport under the AI SDK's own `AbstractChat` (ai@6.0.286), against a
 * real in-process Flue conversation. Case names follow the `describe` blocks
 * of `packages/ai/src/ui/chat.test.ts` they correspond to.
 */
import {
  fauxAssistantMessage,
  fauxText,
  fauxToolCall,
} from "@earendil-works/pi-ai";
import { lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import { afterAll, describe, expect, test, vi } from "vitest";

import { createFlueAiSdkAdapter, createFlueUiStream } from "../client";
import { reduceUiMessageChunks } from "../shared/ai-sdk-oracle";
import {
  harnessAdapterConfig,
  harnessTools,
  startFlueHarness,
} from "./flue-harness";
import { TestChat } from "./test-chat";

import type { FlueChatTransportOptions } from "../client";
import type { AgentSendResult, ConversationStreamChunk } from "@flue/sdk";
import type { ChatInit, UIMessage, UIMessageChunk } from "ai";

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

const createChat = (
  options: {
    readonly transport?: Partial<FlueChatTransportOptions>;
  } & Omit<ChatInit<UIMessage>, "transport"> = {},
) => {
  const client = harness.client();
  const admissions: AgentSendResult[] = [];
  const transport = createFlueAiSdkAdapter(harnessAdapterConfig).chatTransport({
    client,
    onAdmission: ({ admission }) => admissions.push(admission),
    ...options.transport,
  });
  const sendMessages = vi.spyOn(transport, "sendMessages");
  const onFinish = vi.fn<NonNullable<ChatInit<UIMessage>["onFinish"]>>();
  const onError = vi.fn<NonNullable<ChatInit<UIMessage>["onError"]>>();
  const chat = new TestChat({ ...options, transport, onFinish, onError });
  return { admissions, chat, client, onError, onFinish, sendMessages };
};

describe("upstream: 'send a simple message'", () => {
  test("a completed turn leaves the chat ready with one assistant message", async () => {
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

describe("upstream: 'send handle a disconnected response stream'", () => {
  test("a failed submission puts the chat in error with the server's text", async () => {
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

describe("upstream: 'send handle a stop and an aborted response stream'", () => {
  test("stopping the chat ends only the local observer; the Flue turn completes", async () => {
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
    await client.wait(admissions[0]!);
    const history = await client.history();
    expect(history.settlements.at(-1)).toMatchObject({ outcome: "completed" });
  });

  test("observed: a durable Flue abort ends the turn, but the AI SDK does not report it as an abort", async () => {
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

  test("an in-band client tool result does not trigger an automatic follow-up", async () => {
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
  test("a turn ending on a settled client-tool step does not satisfy the continuation predicate", async () => {
    const written: UIMessageChunk[] = [];
    const projector = createFlueUiStream({
      submissionId: "submission-1",
      ...harnessAdapterConfig,
      write: (chunk) => written.push(chunk),
    });
    for (const chunk of clientToolStepThenAbort) projector.accept(chunk);
    const { message } = await reduceUiMessageChunks(written);
    const withoutProviderExecution = structuredClone(message!);
    for (const part of withoutProviderExecution.parts) {
      if ("providerExecuted" in part) part.providerExecuted = undefined;
    }

    expect(
      lastAssistantMessageIsCompleteWithToolCalls({ messages: [message!] }),
    ).toBe(false);
    expect(
      lastAssistantMessageIsCompleteWithToolCalls({
        messages: [withoutProviderExecution],
      }),
    ).toBe(true);
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

test("decision: resuming finds no stream, so reopened history is the only recovery", async () => {
  const { chat, sendMessages } = createChat();

  await chat.resumeStream();

  expect(chat.status).toBe("ready");
  expect(chat.statuses).toEqual([]);
  expect(sendMessages).not.toHaveBeenCalled();
});
