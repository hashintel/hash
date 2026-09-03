import { expect, test, vi } from "vitest";

import {
  BrunchPanelConversationTracker,
  createBrunchPanelTransport,
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
  const tracker = new BrunchPanelConversationTracker("conversation-stable");
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
  await stream.pipeTo(new WritableStream());

  expect(send).toHaveBeenCalledOnce();
  expect(send).toHaveBeenCalledWith({
    message: { kind: "user", body: "Typed tracer." },
    signal: undefined,
  });
  expect(tracker.submissionForInput("user-1")).toBe("submission-1");
  expect(tracker.submissionForResponse("assistant-1")).toBe("submission-1");
  expect(onAdmission).toHaveBeenCalledOnce();
  expect(onAdmission).toHaveBeenCalledWith(admission);
});
