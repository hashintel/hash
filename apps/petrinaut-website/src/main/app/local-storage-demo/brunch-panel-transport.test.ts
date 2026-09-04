import { FlueApiError } from "@flue/sdk";
import { expect, test, vi } from "vitest";

import {
  BrunchPanelConversationTracker,
  createBrunchPanelTransport,
} from "./brunch-panel-transport";

import type {
  AgentSendResult,
  ConversationStreamChunk,
  FlueClient,
} from "@flue/sdk";
import type { UIMessageChunk } from "ai";

test("delegates one typed message to the supplied Flue conversation", async () => {
  const admission: AgentSendResult = {
    streamUrl: "http://brunch.test/stream",
    offset: "offset-1",
    submissionId: "submission-1",
    uid: "uid-1",
  };
  const send = vi.fn<FlueClient["send"]>(async () => admission);
  const wait = vi.fn<FlueClient["wait"]>(async (_admission, options) => {
    await options?.onEvent?.({
      type: "message-started",
      conversationId: "conversation-stable",
      messageId: "assistant-1",
      submissionId: admission.submissionId,
      turnId: "turn-1",
      position: { batch: 1, index: 0 },
    });
    await options?.onEvent?.({
      type: "message-completed",
      conversationId: "conversation-stable",
      messageId: "assistant-1",
      position: { batch: 1, index: 1 },
    });
    await options?.onEvent?.({
      type: "submission-settled",
      conversationId: "conversation-stable",
      submissionId: admission.submissionId,
      outcome: "completed",
      position: { batch: 1, index: 2 },
    });
  });
  const client = {
    send,
    wait,
  } as Pick<FlueClient, "send" | "wait"> as FlueClient;
  const tracker = new BrunchPanelConversationTracker();
  const admissionListener = vi.fn();
  tracker.subscribeToAdmission(
    { kind: "user", messageId: "user-1" },
    admissionListener,
  );
  const responseCompletedListener = vi.fn();
  tracker.subscribeToResponseMessageCompleted(responseCompletedListener);
  const responseStartedListener = vi.fn();
  tracker.subscribeToResponseMessageStarted(responseStartedListener);
  const onAdmission = vi.fn();
  const transport = createBrunchPanelTransport(
    Promise.resolve(client),
    tracker,
    { onAdmission },
  );
  const stream = await transport.sendMessages({
    trigger: "submit-message",
    chatId: "conversation-stable",
    messageId: undefined,
    messages: [
      {
        id: "user-1",
        role: "user",
        parts: [{ type: "text", text: "Typed tracer." }],
      },
    ],
    abortSignal: undefined,
  });
  expect(admissionListener).toHaveBeenCalledOnce();
  expect(admissionListener).toHaveBeenCalledWith({
    admission,
    kind: "user",
    messageId: "user-1",
  });
  await stream.pipeTo(new WritableStream());

  expect(send).toHaveBeenCalledOnce();
  expect(send).toHaveBeenCalledWith({
    idempotencyKey: "ai-sdk:user-1",
    message: { kind: "user", body: "Typed tracer." },
    signal: undefined,
  });
  expect(tracker.submissionForInput("user-1")).toBe("submission-1");
  expect(tracker.submissionsForResponse("assistant-1")).toEqual([
    "submission-1",
  ]);
  expect(responseStartedListener).toHaveBeenCalledOnce();
  expect(responseStartedListener).toHaveBeenCalledWith({
    messageId: "assistant-1",
    position: { batch: 1, index: 0 },
    submissionId: "submission-1",
  });
  expect(responseCompletedListener).toHaveBeenCalledOnce();
  expect(responseCompletedListener).toHaveBeenCalledWith({
    messageId: "assistant-1",
    position: { batch: 1, index: 1 },
    submissionId: "submission-1",
  });
  expect(onAdmission).toHaveBeenCalledOnce();
  expect(onAdmission).toHaveBeenCalledWith(admission);
});

test("seeds scratch mode and admits construction calls as browser tools", async () => {
  const admission: AgentSendResult = {
    streamUrl: "http://brunch.test/stream",
    offset: "offset-scratch",
    submissionId: "submission-scratch",
    uid: "uid-scratch",
  };
  const events: readonly ConversationStreamChunk[] = [
    {
      type: "message-started",
      conversationId: "conversation-scratch",
      messageId: "assistant-scratch",
      submissionId: admission.submissionId,
      turnId: "turn-scratch",
      position: { batch: 1, index: 0 },
    },
    {
      type: "tool-input",
      conversationId: "conversation-scratch",
      messageId: "assistant-scratch",
      toolCallId: "add-place",
      toolName: "addPlace",
      input: {
        id: "orders_waiting",
        name: "OrdersWaiting",
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
        x: 80,
        y: 160,
      },
      position: { batch: 1, index: 1 },
    },
    {
      type: "tool-output",
      conversationId: "conversation-scratch",
      toolCallId: "add-place",
      output: { awaiting: "client" },
      position: { batch: 1, index: 2 },
    },
    {
      type: "submission-settled",
      conversationId: "conversation-scratch",
      submissionId: admission.submissionId,
      outcome: "completed",
      position: { batch: 1, index: 3 },
    },
  ];
  const send = vi.fn<FlueClient["send"]>(async () => admission);
  const wait = vi.fn<FlueClient["wait"]>(async (_admission, options) => {
    for (const event of events) {
      // Preserve the canonical stream order.
      await options?.onEvent?.(event);
    }
  });
  const client = {
    send,
    wait,
  } as Pick<FlueClient, "send" | "wait"> as FlueClient;
  const initialData = { mode: "scratch-project-construction" };
  const transport = createBrunchPanelTransport(
    Promise.resolve(client),
    new BrunchPanelConversationTracker(),
    {
      clientToolNames: new Set(["addPlace"]),
      initialData,
    } as {
      readonly clientToolNames: ReadonlySet<string>;
      readonly initialData: unknown;
    },
  );

  const stream = await transport.sendMessages({
    trigger: "submit-message",
    chatId: "conversation-scratch",
    messageId: undefined,
    messages: [
      {
        id: "user-scratch",
        role: "user",
        parts: [{ type: "text", text: "Model this process." }],
      },
    ],
    abortSignal: undefined,
  });
  const chunks: UIMessageChunk[] = [];
  for await (const chunk of stream) chunks.push(chunk);

  expect(send).toHaveBeenCalledWith({
    idempotencyKey: "ai-sdk:user-scratch",
    initialData,
    message: { kind: "user", body: "Model this process." },
    signal: undefined,
  });
  expect(
    chunks.find(
      (chunk) =>
        chunk.type === "tool-input-available" && chunk.toolName === "addPlace",
    ),
  ).toMatchObject({
    type: "tool-input-available",
    toolName: "addPlace",
  });
  expect(
    chunks.find(
      (chunk) =>
        chunk.type === "tool-input-available" && chunk.toolName === "addPlace",
    ),
  ).not.toHaveProperty("providerExecuted");
});

test("matches client-tool admissions once and supports unsubscribe", () => {
  const admission: AgentSendResult = {
    streamUrl: "http://brunch.test/stream",
    offset: "offset-1",
    submissionId: "submission-1",
    uid: "uid-1",
  };
  const tracker = new BrunchPanelConversationTracker();
  const matchingListener = vi.fn();
  const unsubscribedListener = vi.fn();
  tracker.subscribeToAdmission(
    {
      kind: "client-tool-result",
      messageId: "assistant-question",
    },
    matchingListener,
  );
  const unsubscribe = tracker.subscribeToAdmission(
    {
      kind: "client-tool-result",
      messageId: "assistant-question",
    },
    unsubscribedListener,
  );
  unsubscribe();

  tracker.recordAdmission({
    admission,
    kind: "user",
    messageId: "assistant-question",
  });
  tracker.recordAdmission({
    admission,
    kind: "client-tool-result",
    messageId: "assistant-other",
  });
  expect(matchingListener).not.toHaveBeenCalled();

  const matchedAdmission = {
    ...admission,
    submissionId: "submission-tool-result",
  };
  const event = {
    admission: matchedAdmission,
    kind: "client-tool-result" as const,
    messageId: "assistant-question",
  };
  tracker.recordAdmission(event);
  tracker.recordAdmission(event);

  expect(matchingListener).toHaveBeenCalledOnce();
  expect(matchingListener).toHaveBeenCalledWith(event);
  expect(unsubscribedListener).not.toHaveBeenCalled();
});

test("records every submission that wrote a resumed assistant message", () => {
  const tracker = new BrunchPanelConversationTracker();
  const responseStartedListener = vi.fn();
  tracker.subscribeToResponseMessageStarted(responseStartedListener);
  tracker.recordResponse({
    messageId: "assistant-1",
    position: { batch: 1, index: 0 },
    submissionId: "submission-1",
  });
  tracker.recordResponse({
    messageId: "assistant-1",
    position: { batch: 2, index: 0 },
    submissionId: "submission-continuation",
  });
  tracker.recordResponse({
    messageId: "assistant-1",
    position: { batch: 2, index: 0 },
    submissionId: "submission-continuation",
  });

  expect(tracker.submissionsForResponse("assistant-1")).toEqual([
    "submission-1",
    "submission-continuation",
  ]);
  expect(tracker.submissionsForResponse("assistant-2")).toBeUndefined();
  expect(responseStartedListener.mock.calls).toEqual([
    [
      {
        messageId: "assistant-1",
        position: { batch: 1, index: 0 },
        submissionId: "submission-1",
      },
    ],
    [
      {
        messageId: "assistant-1",
        position: { batch: 2, index: 0 },
        submissionId: "submission-continuation",
      },
    ],
    [
      {
        messageId: "assistant-1",
        position: { batch: 2, index: 0 },
        submissionId: "submission-continuation",
      },
    ],
  ]);
});

test("publishes Stop immediately and supports unsubscribe", () => {
  const tracker = new BrunchPanelConversationTracker();
  const listener = vi.fn();
  const unsubscribedListener = vi.fn();
  tracker.subscribeToStopRequested(listener);
  const unsubscribe = tracker.subscribeToStopRequested(unsubscribedListener);
  unsubscribe();

  tracker.recordStopRequested();

  expect(listener).toHaveBeenCalledOnce();
  expect(unsubscribedListener).not.toHaveBeenCalled();
});

test("settles in-flight submissions before a durable abort can target them", async () => {
  const tracker = new BrunchPanelConversationTracker();
  let admit: (() => void) | undefined;
  void tracker.trackSubmission(
    new Promise<void>((resolve) => {
      admit = resolve;
    }),
  );
  let settled = false;
  void tracker.settleInFlightSubmissions().then(() => {
    settled = true;
  });

  await Promise.resolve();
  expect(settled).toBe(false);

  admit?.();
  await vi.waitFor(() => expect(settled).toBe(true));

  const rejected = tracker.trackSubmission(
    Promise.reject(new Error("rejected admission")),
  );
  await expect(rejected).rejects.toThrow("rejected admission");
  await expect(tracker.settleInFlightSubmissions()).resolves.toBeUndefined();
});

test("publishes a typed admission failure for the exact panel input", async () => {
  const send = vi.fn<FlueClient["send"]>(async () => {
    throw new FlueApiError(500, "");
  });
  const tracker = new BrunchPanelConversationTracker();
  const failureListener = vi.fn();
  tracker.subscribeToAdmissionFailure(
    { kind: "user", messageId: "voice-realtime:1:item-1:0" },
    failureListener,
  );
  const transport = createBrunchPanelTransport(
    Promise.resolve({ send } as Pick<FlueClient, "send"> as FlueClient),
    tracker,
  );

  const submission = transport.sendMessages({
    trigger: "submit-message",
    chatId: "conversation-stable",
    messageId: undefined,
    messages: [
      {
        id: "voice-realtime:1:item-1:0",
        role: "user",
        parts: [{ type: "text", text: "One Voice turn." }],
      },
    ],
    abortSignal: undefined,
  });

  await expect(submission).rejects.toMatchObject({
    failure: { kind: "ambiguous" },
    name: "FlueChatAdmissionError",
  });
  expect(failureListener).toHaveBeenCalledOnce();
  expect(failureListener).toHaveBeenCalledWith(
    expect.objectContaining({
      failure: { kind: "ambiguous" },
      name: "FlueChatAdmissionError",
    }),
  );
  expect(send).toHaveBeenCalledOnce();
});
