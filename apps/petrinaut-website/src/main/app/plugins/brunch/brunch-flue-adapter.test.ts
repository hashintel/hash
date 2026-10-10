import { readUIMessageStream } from "ai";
import { describe, expect, test, vi } from "vitest";

import { canonicalBrunchFlueAdapter } from "./brunch-flue-adapter";

import type {
  AgentSendResult,
  FlueClient,
  FlueConversationSettlement,
} from "@flue/sdk";
import type { PetrinautAiMessage } from "@hashintel/petrinaut/ui";

const agentMetadata = { stopped: true, source: "voice", unrendered: 1 };

const runLiveTurn = async (
  outcome: FlueConversationSettlement["outcome"],
): Promise<PetrinautAiMessage | undefined> => {
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
      conversationId: "conversation-1",
      messageId: "assistant-1",
      submissionId: admission.submissionId,
      turnId: "turn-1",
      metadata: agentMetadata,
      position: { batch: 1, index: 0 },
    });
    await options?.onEvent?.({
      type: "submission-settled",
      conversationId: "conversation-1",
      submissionId: admission.submissionId,
      outcome,
      position: { batch: 1, index: 1 },
    });
  });
  const client = { send, wait } as Pick<
    FlueClient,
    "send" | "wait"
  > as FlueClient;
  const stream = await canonicalBrunchFlueAdapter
    .chatTransport({ client })
    .sendMessages({
      trigger: "submit-message",
      chatId: "conversation-1",
      messageId: undefined,
      messages: [
        { id: "user-1", role: "user", parts: [{ type: "text", text: "Go" }] },
      ],
      abortSignal: undefined,
    });
  let message: PetrinautAiMessage | undefined;
  for await (const snapshot of readUIMessageStream<PetrinautAiMessage>({
    stream,
  })) {
    message = snapshot;
  }
  return message;
};

const reopen = (outcome: FlueConversationSettlement["outcome"]) =>
  canonicalBrunchFlueAdapter.reopen({
    messages: [
      {
        id: "assistant-1",
        role: "assistant",
        purpose: "assistant",
        display: "visible",
        submissionId: "submission-1",
        metadata: agentMetadata,
        parts: [{ type: "text", text: "Partial.", state: "done" }],
      },
    ],
    settlements: [{ submissionId: "submission-1", outcome }],
  })[0]?.metadata;

describe("Brunch's stop marker through Petrinaut's metadata schema", () => {
  test("a completed response drops agent-authored `stopped` and keys Petrinaut does not render", async () => {
    const live = await runLiveTurn("completed");

    expect(live?.metadata).toEqual({ source: "voice" });
    expect(reopen("completed")).toEqual({ source: "voice" });
  });

  test("an aborted response is stopped, live and after reopen", async () => {
    const live = await runLiveTurn("aborted");

    expect(live?.metadata).toEqual({ source: "voice", stopped: true });
    expect(reopen("aborted")).toEqual({ source: "voice", stopped: true });
  });
});
