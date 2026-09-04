import { expect, test, vi } from "vitest";

import {
  BrunchPanelConversationTracker,
  createBrunchPanelTransport,
  createUnavailableBrunchPanelTransport,
} from "./brunch-panel-transport";

import type { AgentSendResult, FlueClient } from "@flue/sdk";

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
      type: "submission-settled",
      conversationId: "conversation-stable",
      submissionId: admission.submissionId,
      outcome: "completed",
      position: { batch: 1, index: 1 },
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
    idempotencyKey: "ai-sdk:user:user-1",
    message: { kind: "user", body: "Typed tracer." },
    signal: undefined,
  });
  expect(tracker.submissionForInput("user-1")).toBe("submission-1");
  expect(tracker.submissionsForResponse("assistant-1")).toEqual([
    "submission-1",
  ]);
  expect(onAdmission).toHaveBeenCalledOnce();
  expect(onAdmission).toHaveBeenCalledWith(admission);
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
  tracker.recordResponse("assistant-1", "submission-1");
  tracker.recordResponse("assistant-1", "submission-continuation");
  tracker.recordResponse("assistant-1", "submission-continuation");

  expect(tracker.submissionsForResponse("assistant-1")).toEqual([
    "submission-1",
    "submission-continuation",
  ]);
  expect(tracker.submissionsForResponse("assistant-2")).toBeUndefined();
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

test("returns a fixture-scoped mutation result through the same Flue client", async () => {
  const admission: AgentSendResult = {
    streamUrl: "http://brunch.test/stream",
    offset: "offset-2",
    submissionId: "submission-2",
    uid: "uid-2",
  };
  const send = vi.fn<FlueClient["send"]>(async () => admission);
  const wait = vi.fn<FlueClient["wait"]>(async () => {});
  const client = {
    send,
    wait,
  } as Pick<FlueClient, "send" | "wait"> as FlueClient;
  const transport = createBrunchPanelTransport(
    Promise.resolve(client),
    new BrunchPanelConversationTracker(),
    { clientToolNames: new Set(["addArc"]) },
  );
  const stream = await transport.sendMessages({
    trigger: "submit-message",
    chatId: "conversation-stable",
    messageId: "assistant-1",
    messages: [
      {
        id: "assistant-1",
        role: "assistant",
        parts: [
          {
            type: "dynamic-tool",
            toolName: "addArc",
            toolCallId: "add-arc-1",
            state: "output-available",
            input: {},
            output: { applied: true },
          },
        ],
      },
    ],
    abortSignal: undefined,
  });
  await stream.pipeTo(new WritableStream());

  expect(send).toHaveBeenCalledWith({
    idempotencyKey: "ai-sdk:client-tools:assistant-1:add-arc-1",
    message: {
      kind: "signal",
      type: "client-tool-result",
      tagName: "client-tool-result",
      body: JSON.stringify([
        {
          toolCallId: "add-arc-1",
          toolName: "addArc",
          output: { applied: true },
        },
      ]),
      attributes: { toolCallIds: "add-arc-1" },
    },
    signal: undefined,
  });
});

test("refuses fixture traffic when the mounted Flue route is unavailable", async () => {
  const transport = createUnavailableBrunchPanelTransport(
    "Fixture route unavailable.",
  );

  await expect(
    transport.sendMessages({
      trigger: "submit-message",
      chatId: "conversation-stable",
      messageId: undefined,
      messages: [],
      abortSignal: undefined,
    }),
  ).rejects.toThrow("Fixture route unavailable.");
});
