import { expect, test } from "vitest";

import { formatFlueTranscript } from "../src/conversation/transcript";

import type { FlueConversationSnapshot } from "@flue/sdk";

const snapshotWithDataPart: FlueConversationSnapshot = {
  v: 1,
  conversationId: "conversation-1",
  offset: "0",
  messages: [
    {
      id: "assistant-1",
      role: "assistant",
      purpose: "assistant",
      display: "visible",
      parts: [
        { type: "text", text: "Here is the order.", state: "done" },
        { type: "data-orderCard", data: { orderId: "42", status: "loaded" } },
      ],
    },
  ],
  settlements: [],
};

test("the human transcript names Flue data parts instead of omitting them", () => {
  expect(formatFlueTranscript(snapshotWithDataPart)).toContain(
    '- data orderCard: {"orderId":"42","status":"loaded"}',
  );
});
