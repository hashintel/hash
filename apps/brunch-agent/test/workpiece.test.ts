import { describe, expect, test } from "vitest";

import {
  PREPARED_WORKPIECE_AUTHORSHIP,
  PREPARED_WORKPIECE_CLAIM_BOUNDARY,
  PREPARED_WORKPIECE_SIGNAL_TAG,
  recoverRunbookWorkpiece,
} from "../src/conversation/workpiece.ts";

import type {
  FlueConversationMessage,
  FlueConversationSnapshot,
} from "@flue/sdk";

const workpiece = (name: string): string =>
  `\`\`\`runbook-ir\n# ${name}\n\`\`\``;

const preparedMessage = (
  id = "prepared",
  submissionId = "prepare-submission",
): FlueConversationMessage => ({
  id,
  role: "system",
  purpose: "dispatch",
  display: "diagnostic",
  submissionId,
  signal: {
    tagName: PREPARED_WORKPIECE_SIGNAL_TAG,
    attributes: {
      authorship: PREPARED_WORKPIECE_AUTHORSHIP,
      claimBoundary: PREPARED_WORKPIECE_CLAIM_BOUNDARY,
      fixtureId: "crew-reservation-v1",
    },
  },
  parts: [{ type: "text", text: workpiece("Prepared"), state: "done" }],
});

const assistantMessage = (
  id: string,
  submissionId: string,
  name: string,
): FlueConversationMessage => ({
  id,
  role: "assistant",
  purpose: "assistant",
  display: "visible",
  submissionId,
  parts: [{ type: "text", text: workpiece(name), state: "done" }],
});

const snapshot = (
  messages: FlueConversationMessage[],
): FlueConversationSnapshot => ({
  v: 1,
  conversationId: "conversation",
  offset: "1",
  messages,
  settlements: [],
});

describe("recoverRunbookWorkpiece", () => {
  test("recovers the tagged prepared source without relabelling its authorship", () => {
    expect(
      recoverRunbookWorkpiece(snapshot([preparedMessage()])),
    ).toMatchObject({
      authorship: "test-authored",
      content: "# Prepared",
      sourceKind: "prepared-signal",
      sourceMessageId: "prepared",
      sourceSubmissionId: "prepare-submission",
    });
  });

  test("does not treat the preparation response as a model-authored revision", () => {
    expect(
      recoverRunbookWorkpiece(
        snapshot([
          preparedMessage(),
          assistantMessage(
            "preparation-response",
            "prepare-submission",
            "Echoed by preparation response",
          ),
        ]),
      ),
    ).toMatchObject({
      authorship: "test-authored",
      content: "# Prepared",
      sourceKind: "prepared-signal",
    });
  });

  test("selects the latest genuine assistant revision", () => {
    expect(
      recoverRunbookWorkpiece(
        snapshot([
          preparedMessage(),
          assistantMessage("revision-1", "turn-1", "Revision one"),
          assistantMessage("revision-2", "turn-2", "Revision two"),
        ]),
      ),
    ).toMatchObject({
      authorship: "model-produced",
      content: "# Revision two",
      sourceKind: "assistant",
      sourceMessageId: "revision-2",
      sourceSubmissionId: "turn-2",
    });
  });

  test("retains ordinary assistant-only workpiece recovery", () => {
    expect(
      recoverRunbookWorkpiece(
        snapshot([
          assistantMessage("ordinary", "ordinary-turn", "Ordinary workpiece"),
        ]),
      ),
    ).toMatchObject({
      authorship: "model-produced",
      content: "# Ordinary workpiece",
      sourceKind: "assistant",
    });
  });

  test("fails rather than choosing between multiple prepared sources", () => {
    expect(() =>
      recoverRunbookWorkpiece(
        snapshot([
          preparedMessage("prepared-1"),
          preparedMessage("prepared-2", "prepare-submission-2"),
        ]),
      ),
    ).toThrow(/more than one prepared workpiece source/u);
  });
});
