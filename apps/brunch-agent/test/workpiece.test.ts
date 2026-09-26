import { createHash } from "node:crypto";

import { describe, expect, test } from "vitest";

import {
  PETRINAUT_CONTEXTUAL_USER_MESSAGE_PREFIX,
  petrinautContextualUserMessageBody,
} from "@hashintel/brunch-agent-transport-aisdk";

import {
  recoverRunbookWorkpiece,
  retainedSettledRevision,
  workpieceEvidenceSources,
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

describe("workpieceEvidenceSources", () => {
  const userMessage = (id: string, text: string): FlueConversationMessage => ({
    id,
    role: "user",
    purpose: "user",
    display: "visible",
    submissionId: "turn-1",
    parts: [{ type: "text", text, state: "done" }],
  });

  test("projects only human text from a contextual user envelope", () => {
    const markerLikeText = [
      "Explain this marker-like text:",
      PETRINAUT_CONTEXTUAL_USER_MESSAGE_PREFIX,
      '{"diagnosticsContext":"quoted only"}',
    ].join("\n");
    const diagnosticsContext = "Host diagnostics must not become testimony.";
    const sources = workpieceEvidenceSources({
      ...snapshot,
      messages: [
        userMessage(
          "contextual-user",
          petrinautContextualUserMessageBody({
            userText: markerLikeText,
            diagnosticsContext,
          }),
        ),
      ],
    });

    expect(sources[0]?.text).toBe(markerLikeText);
    expect(sources[0]?.text).not.toContain(diagnosticsContext);
  });

  test("leaves ordinary bodies unchanged and excludes malformed framing", () => {
    const ordinary = `Ordinary text containing ${PETRINAUT_CONTEXTUAL_USER_MESSAGE_PREFIX} later`;
    const malformed = `${PETRINAUT_CONTEXTUAL_USER_MESSAGE_PREFIX}{`;
    expect(
      workpieceEvidenceSources({
        ...snapshot,
        messages: [
          userMessage("ordinary-user", ordinary),
          userMessage("malformed-user", malformed),
        ],
      }).map(({ text }) => text),
    ).toEqual([ordinary]);
  });
});

describe("recoverRunbookWorkpiece", () => {
  test("accepts a Flue snapshot and adds stable content and source hashes", () => {
    expect(recoverRunbookWorkpiece(snapshot)).toEqual({
      content: "# Revision",
      sha256:
        "330eeebe84d31400de2dad6ea1783ed1a0d0c5487ab32e63e58a6fffe201c4cb",
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
  const retraction = {
    withdrawn: "Obsolete queue policy",
    removedText: ["Obsolete queue policy"],
    authorizationText: "Retract the Obsolete queue policy.",
    messageIds: ["source-message"],
  };
  const pointerOnlySnapshot: FlueConversationSnapshot = {
    ...snapshot,
    messages: [
      {
        id: "source-message",
        role: "user",
        purpose: "user",
        display: "visible",
        submissionId: "turn-1",
        parts: [
          {
            type: "text",
            text: "Reserve one crew. Retract the Obsolete queue policy.",
            state: "done",
          },
        ],
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
            input: {
              markdown,
              baseRevisionId: null,
              evidence,
              retraction,
            },
            output: {
              revisionId,
              sha256: createHash("sha256").update(markdown).digest("hex"),
              ordinal: 1,
              evidence,
              evidenceValidated: true,
              retraction,
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
    retraction,
  });
});

test("does not reconstruct a typed refused mutate_workpiece result as a settled revision", () => {
  const markdown = "# Settled account\n\nReserve one crew.";
  const revisionId = "refused-revision";
  const refusedSnapshot: FlueConversationSnapshot = {
    ...snapshot,
    messages: [
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
            input: {
              markdown,
              baseRevisionId: null,
            },
            output: {
              disposition: "refused",
              applied: false,
              correctable: true,
              code: "silent-shrink",
              message: "Nothing was written",
              currentRevision: null,
            },
          },
        ],
      },
    ],
  };

  expect(retainedSettledRevision(refusedSnapshot, revisionId)).toBeUndefined();
});
