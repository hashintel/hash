import { createHash } from "node:crypto";

import { describe, expect, test } from "vitest";

import {
  recoverRunbookWorkpiece,
  retainedSettledRevision,
} from "../src/conversation/workpiece.ts";

import type {
  FlueConversationMessage,
  FlueConversationSnapshot,
} from "@flue/sdk";

const revisionMessage: FlueConversationMessage = {
  id: "revision",
  role: "assistant",
  purpose: "assistant",
  display: "visible",
  submissionId: "turn-1",
  parts: [
    { type: "text", text: "```runbook-ir\n# Revision\n```", state: "done" },
  ],
};

const snapshot: FlueConversationSnapshot = {
  v: 1,
  conversationId: "conversation",
  offset: "1",
  messages: [revisionMessage],
  settlements: [],
};

describe("recoverRunbookWorkpiece", () => {
  test("accepts a Flue snapshot and adds stable content and source hashes", () => {
    expect(recoverRunbookWorkpiece(snapshot)).toEqual({
      authorship: "model-produced",
      content: "# Revision",
      sha256:
        "330eeebe84d31400de2dad6ea1783ed1a0d0c5487ab32e63e58a6fffe201c4cb",
      sourceKind: "assistant",
      sourceMessageId: "revision",
      sourceMessageSha256:
        "eced072a0cecc954fa63a7f9664e1dffea1a685f71d2b835a9af971a115718e5",
      sourceSubmissionId: "turn-1",
    });
  });
});

test("reconstructs validated evidence from pointer-only settlement output", () => {
  const markdown = "# Settled account\n\nReserve one crew.";
  const evidence = [
    {
      locator: { start: 19, end: markdown.length },
      messageIds: ["source-message"],
      kind: "elicited" as const,
    },
  ];
  const revisionId = "pointer-only-revision";
  const pointerOnlySnapshot: FlueConversationSnapshot = {
    ...snapshot,
    messages: [
      {
        id: "source-message",
        role: "user",
        purpose: "user",
        display: "visible",
        submissionId: "turn-1",
        parts: [{ type: "text", text: "Reserve one crew.", state: "done" }],
      },
      {
        id: "settlement-message",
        role: "assistant",
        purpose: "assistant",
        display: "visible",
        submissionId: "turn-1",
        parts: [
          {
            type: "dynamic-tool",
            toolCallId: revisionId,
            toolName: "mutate_workpiece",
            state: "output-available",
            input: { markdown, baseRevisionId: null, evidence },
            output: {
              revisionId,
              sha256: createHash("sha256").update(markdown).digest("hex"),
              ordinal: 1,
              evidence,
              evidenceValidated: true,
            },
          },
        ],
      },
    ],
  };

  expect(retainedSettledRevision(pointerOnlySnapshot, revisionId)).toEqual({
    revisionId,
    sha256: createHash("sha256").update(markdown).digest("hex"),
    ordinal: 1,
    markdown,
    evidence,
    evidenceValidated: true,
  });
});
