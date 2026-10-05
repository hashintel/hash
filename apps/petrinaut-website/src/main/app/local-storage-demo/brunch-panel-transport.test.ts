import { FlueApiError } from "@flue/sdk";
import { expect, test, vi } from "vitest";

import { canonicalPetrinautClientToolNames } from "./brunch-client-tools";
import {
  BrunchPanelConversationTracker,
  createBrunchPanelTransport,
  createUnavailableBrunchPanelTransport,
} from "./brunch-panel-transport";

import type { AgentSendResult, FlueClient } from "@flue/sdk";

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

test("projects adapter names dynamically and untouched canonical names statically in the live stream", async () => {
  const admission: AgentSendResult = {
    streamUrl: "http://brunch.test/stream",
    offset: "offset-hidden",
    submissionId: "submission-hidden",
    uid: "uid-hidden",
  };
  const send = vi.fn<FlueClient["send"]>(async () => admission);
  const wait = vi.fn<FlueClient["wait"]>(async (_admission, options) => {
    await options?.onEvent?.({
      type: "message-started",
      conversationId: "conversation-stable",
      messageId: "assistant-hidden",
      submissionId: admission.submissionId,
      turnId: "turn-hidden",
      position: { batch: 1, index: 0 },
    });
    for (const [index, toolName] of [
      "getLatestNetDefinition",
      "readPetrinautDoc",
    ].entries()) {
      await options?.onEvent?.({
        type: "tool-input",
        conversationId: "conversation-stable",
        messageId: "assistant-hidden",
        toolCallId: `tool-${index}`,
        toolName,
        input: {},
        position: { batch: 1, index: index + 1 },
      });
    }
    await options?.onEvent?.({
      type: "message-completed",
      conversationId: "conversation-stable",
      messageId: "assistant-hidden",
      position: { batch: 1, index: 3 },
    });
    await options?.onEvent?.({
      type: "submission-settled",
      conversationId: "conversation-stable",
      submissionId: admission.submissionId,
      outcome: "completed",
      position: { batch: 1, index: 4 },
    });
  });
  const transport = createBrunchPanelTransport(
    Promise.resolve({ send, wait } as Pick<
      FlueClient,
      "send" | "wait"
    > as FlueClient),
    new BrunchPanelConversationTracker(),
    {
      clientToolNames: canonicalPetrinautClientToolNames,
      dynamicClientToolNames: new Set(["getLatestNetDefinition"]),
    },
  );
  const stream = await transport.sendMessages({
    trigger: "submit-message",
    chatId: "conversation-stable",
    messageId: undefined,
    messages: [
      {
        id: "user-hidden",
        role: "user",
        parts: [{ type: "text", text: "Arrange and update the net." }],
      },
    ],
    abortSignal: undefined,
  });
  const chunks = [];
  const reader = stream.getReader();
  for (;;) {
    const result = await reader.read();
    if (result.done) break;
    chunks.push(result.value);
  }

  expect(chunks).toContainEqual(
    expect.objectContaining({
      type: "tool-input-available",
      toolName: "getLatestNetDefinition",
      dynamic: true,
    }),
  );
  expect(chunks).toContainEqual(
    expect.objectContaining({
      type: "tool-input-available",
      toolName: "readPetrinautDoc",
    }),
  );
  expect(chunks).not.toContainEqual(
    expect.objectContaining({
      toolName: "readPetrinautDoc",
      dynamic: true,
    }),
  );
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
