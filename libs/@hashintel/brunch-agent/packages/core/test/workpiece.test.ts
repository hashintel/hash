import { describe, expect, test } from "vitest";

import {
  createPreparedWorkpieceDelivery,
  PREPARED_WORKPIECE_AUTHORSHIP,
  PREPARED_WORKPIECE_CLAIM_BOUNDARY,
  PREPARED_WORKPIECE_SIGNAL_TAG,
  selectRunbookWorkpiece,
  type WorkpieceHistory,
  type WorkpieceHistoryMessage,
} from "../src/workpiece";

const workpiece = (name: string): string =>
  `\`\`\`runbook-ir\n# ${name}\n\`\`\``;

const preparedMessage = (
  id = "prepared",
  submissionId = "prepare-submission",
): WorkpieceHistoryMessage => ({
  id,
  role: "system",
  purpose: "dispatch",
  submissionId,
  signal: {
    tagName: PREPARED_WORKPIECE_SIGNAL_TAG,
    attributes: {
      authorship: PREPARED_WORKPIECE_AUTHORSHIP,
      claimBoundary: PREPARED_WORKPIECE_CLAIM_BOUNDARY,
      fixtureId: "crew-reservation-v1",
    },
  },
  parts: [{ type: "text", text: workpiece("Prepared") }],
});

const assistantMessage = (
  id: string,
  submissionId: string,
  name: string,
): WorkpieceHistoryMessage => ({
  id,
  role: "assistant",
  purpose: "assistant",
  submissionId,
  parts: [{ type: "text", text: workpiece(name) }],
});

const history = (
  messages: readonly WorkpieceHistoryMessage[],
): WorkpieceHistory => ({
  conversationId: "conversation",
  messages,
});

describe("prepared workpiece delivery", () => {
  test("carries explicit authorship and a revision-stable idempotency key", () => {
    expect(
      createPreparedWorkpieceDelivery({
        fixtureId: "crew-reservation-v1",
        revision: 0,
        body: workpiece("Prepared"),
      }),
    ).toEqual({
      idempotencyKey: "prepared-fixture:crew-reservation-v1:revision-0",
      message: {
        kind: "signal",
        type: "brunch.fixture.prepared",
        tagName: "prepared-fixture",
        body: workpiece("Prepared"),
        attributes: {
          fixtureId: "crew-reservation-v1",
          authorship: "test-authored",
          claimBoundary: "prepared-not-model-produced",
        },
      },
    });
  });

  test("refuses prepared content without a runbook-ir block", () => {
    expect(() =>
      createPreparedWorkpieceDelivery({
        fixtureId: "crew-reservation-v1",
        revision: 0,
        body: "# Not fenced",
      }),
    ).toThrow(/requires a full runbook-ir block/u);
  });
});

describe("selectRunbookWorkpiece", () => {
  test("selects prepared revision zero with its honest authorship", () => {
    expect(selectRunbookWorkpiece(history([preparedMessage()]))).toMatchObject({
      authorship: "test-authored",
      content: "# Prepared",
      fixtureId: "crew-reservation-v1",
      sourceKind: "prepared-signal",
      sourceMessageId: "prepared",
    });
  });

  test("ignores the assistant response to preparation", () => {
    expect(
      selectRunbookWorkpiece(
        history([
          preparedMessage(),
          assistantMessage(
            "preparation-response",
            "prepare-submission",
            "Echo",
          ),
        ]),
      ),
    ).toMatchObject({
      authorship: "test-authored",
      content: "# Prepared",
    });
  });

  test("selects the latest genuine assistant revision", () => {
    expect(
      selectRunbookWorkpiece(
        history([
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
    });
  });

  test("uses canonical log order when the prepared source follows older assistant text", () => {
    expect(
      selectRunbookWorkpiece(
        history([
          assistantMessage("older", "older-turn", "Older assistant text"),
          preparedMessage(),
        ]),
      ),
    ).toMatchObject({
      authorship: "test-authored",
      content: "# Prepared",
      sourceMessageId: "prepared",
    });
  });

  test("refuses malformed and duplicate prepared sources", () => {
    expect(() =>
      selectRunbookWorkpiece(
        history([
          {
            ...preparedMessage(),
            signal: {
              tagName: PREPARED_WORKPIECE_SIGNAL_TAG,
              attributes: { authorship: "model-produced" },
            },
          },
        ]),
      ),
    ).toThrow(/malformed prepared workpiece source/u);

    expect(() =>
      selectRunbookWorkpiece(
        history([
          preparedMessage("prepared-1"),
          preparedMessage("prepared-2", "prepare-submission-2"),
        ]),
      ),
    ).toThrow(/more than one prepared workpiece source/u);
  });
});
