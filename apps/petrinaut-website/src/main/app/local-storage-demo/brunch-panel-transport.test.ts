import { expect, test, vi } from "vitest";

import { createBrunchPanelTransport } from "./brunch-panel-transport";

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
      type: "submission-settled",
      conversationId: "conversation-stable",
      submissionId: admission.submissionId,
      outcome: "completed",
      position: { batch: 1, index: 0 },
    });
  });
  const client = {
    send,
    wait,
  } as Pick<FlueClient, "send" | "wait"> as FlueClient;
  const transport = createBrunchPanelTransport(Promise.resolve(client));
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
});
