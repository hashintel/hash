import { describe, expect, test } from "vitest";

import {
  preparedWorkpieceAuthorship,
  preparedWorkpieceClaimBoundary,
  preparedWorkpieceSignalTag,
  type WorkpieceHistoryMessage,
} from "@hashintel/brunch-agent/workpiece";

import {
  hasCrewReservationTargetArc,
  settleCrewReservationManifest,
} from "./crew-reservation-settled-manifest";
import {
  crewReservationFixtureId,
  dispatchCrewPlaceId,
  preparedCrewReservationNet,
  preparedCrewReservationWorkpiece,
  startFinalInspectionTransitionId,
} from "./prepared-crew-reservation-fixture";

const preparedMessage: WorkpieceHistoryMessage = {
  id: "prepared-message",
  role: "system",
  purpose: "dispatch",
  submissionId: "prepare-submission",
  signal: {
    tagName: preparedWorkpieceSignalTag,
    attributes: {
      fixtureId: crewReservationFixtureId,
      authorship: preparedWorkpieceAuthorship,
      claimBoundary: preparedWorkpieceClaimBoundary,
    },
  },
  parts: [
    {
      type: "text",
      text: preparedCrewReservationWorkpiece,
    },
  ],
};

const settledHistory = (
  messages: readonly WorkpieceHistoryMessage[] = [preparedMessage],
) => ({
  conversationId: "canonical-flue-conversation",
  offset: "10",
  messages,
  settlements: [{ submissionId: "prepare-submission", outcome: "completed" }],
});

const targetMutationMessages = (
  toolCallId = "target-arc-call",
): readonly [WorkpieceHistoryMessage, WorkpieceHistoryMessage] => [
  {
    id: "target-mutation-request",
    role: "assistant",
    purpose: "assistant",
    submissionId: "confirmation-turn",
    parts: [
      {
        type: "dynamic-tool",
        toolCallId,
        toolName: "addArc",
        input: {
          transitionId: startFinalInspectionTransitionId,
          arcDirection: "input",
          placeId: dispatchCrewPlaceId,
          weight: 1,
        },
      },
    ],
  },
  {
    id: "target-mutation-result",
    role: "system",
    purpose: "dispatch",
    submissionId: "mutation-continuation",
    signal: {
      tagName: "client-tool-result",
    },
    parts: [
      {
        type: "text",
        text: JSON.stringify([
          {
            toolCallId,
            toolName: "addArc",
            output: { applied: true },
          },
        ]),
      },
    ],
  },
];

describe("crew-reservation settled manifest", () => {
  test("records a coherent prepared bundle without inventing the target arc", async () => {
    const result = await settleCrewReservationManifest({
      definition: preparedCrewReservationNet,
      history: settledHistory(),
      settledAt: "2026-09-03T12:00:00.000Z",
    });

    expect(result).toMatchObject({
      status: "settled",
      manifest: {
        fixtureId: crewReservationFixtureId,
        revision: 0,
        conversation: {
          canonicalId: "canonical-flue-conversation",
        },
        latestWorkpiece: {
          authorship: "test-authored",
          sourceMessageId: "prepared-message",
        },
        document: {
          targetArc: "absent",
        },
      },
    });
  });

  test("advances only after a completed model revision and document change", async () => {
    const initial = await settleCrewReservationManifest({
      definition: preparedCrewReservationNet,
      history: settledHistory(),
      settledAt: "2026-09-03T12:00:00.000Z",
    });
    if (initial.status !== "settled") {
      throw new Error("Expected the prepared fixture to settle");
    }

    const revisedMessage: WorkpieceHistoryMessage = {
      id: "revised-workpiece",
      role: "assistant",
      purpose: "assistant",
      submissionId: "confirmation-turn",
      parts: [
        {
          type: "text",
          text: preparedCrewReservationWorkpiece.replace(
            "It deliberately lacks",
            "The confirmation resolves",
          ),
        },
      ],
    };
    const revisedDefinition = structuredClone(preparedCrewReservationNet);
    const startInspection = revisedDefinition.transitions.find(
      ({ id }) => id === startFinalInspectionTransitionId,
    );
    if (startInspection === undefined) {
      throw new Error("Missing prepared start-inspection transition");
    }
    startInspection.inputArcs.push({
      placeId: dispatchCrewPlaceId,
      type: "standard",
      weight: 1,
    });

    const result = await settleCrewReservationManifest({
      definition: revisedDefinition,
      history: {
        ...settledHistory([
          preparedMessage,
          ...targetMutationMessages(),
          revisedMessage,
        ]),
        offset: "20",
        settlements: [
          { submissionId: "prepare-submission", outcome: "completed" },
          { submissionId: "confirmation-turn", outcome: "completed" },
        ],
      },
      previous: initial.manifest,
      settledAt: "2026-09-03T12:05:00.000Z",
    });

    expect(hasCrewReservationTargetArc(revisedDefinition)).toBe(true);
    expect(result).toMatchObject({
      status: "settled",
      manifest: {
        revision: 1,
        latestWorkpiece: { authorship: "model-produced" },
        document: { targetArc: "present" },
      },
    });
  });

  test("refuses a model revision without one successful correlated target mutation", async () => {
    const revisedMessage: WorkpieceHistoryMessage = {
      id: "revised-workpiece",
      role: "assistant",
      purpose: "assistant",
      submissionId: "confirmation-turn",
      parts: [{ type: "text", text: preparedCrewReservationWorkpiece }],
    };
    const revisedDefinition = structuredClone(preparedCrewReservationNet);
    const startInspection = revisedDefinition.transitions.find(
      ({ id }) => id === startFinalInspectionTransitionId,
    );
    if (startInspection === undefined) {
      throw new Error("Missing prepared start-inspection transition");
    }
    startInspection.inputArcs.push({
      placeId: dispatchCrewPlaceId,
      type: "standard",
      weight: 1,
    });
    const history = {
      ...settledHistory([preparedMessage, revisedMessage]),
      settlements: [
        { submissionId: "prepare-submission", outcome: "completed" },
        { submissionId: "confirmation-turn", outcome: "completed" },
      ],
    };

    await expect(
      settleCrewReservationManifest({
        definition: revisedDefinition,
        history,
        settledAt: "2026-09-03T12:05:00.000Z",
      }),
    ).resolves.toEqual({
      status: "refused",
      reason: "missing-correlated-mutation",
    });

    const [targetCall, targetResult] = targetMutationMessages();
    await expect(
      settleCrewReservationManifest({
        definition: revisedDefinition,
        history: {
          ...history,
          messages: [
            preparedMessage,
            targetCall,
            {
              ...targetResult,
              parts: [
                {
                  type: "text",
                  text: JSON.stringify([
                    {
                      toolCallId: "target-arc-call",
                      toolName: "addArc",
                      output: { applied: false, reason: "no-op" },
                    },
                  ]),
                },
              ],
            },
            revisedMessage,
          ],
        },
        settledAt: "2026-09-03T12:05:00.000Z",
      }),
    ).resolves.toEqual({
      status: "refused",
      reason: "missing-correlated-mutation",
    });

    await expect(
      settleCrewReservationManifest({
        definition: revisedDefinition,
        history: {
          ...history,
          messages: [
            preparedMessage,
            ...targetMutationMessages(),
            targetMutationMessages()[1],
            revisedMessage,
          ],
        },
        settledAt: "2026-09-03T12:05:00.000Z",
      }),
    ).resolves.toMatchObject({ status: "settled" });

    await expect(
      settleCrewReservationManifest({
        definition: revisedDefinition,
        history: {
          ...history,
          messages: [
            preparedMessage,
            ...targetMutationMessages(),
            ...targetMutationMessages("second-target-arc-call"),
            revisedMessage,
          ],
        },
        settledAt: "2026-09-03T12:05:00.000Z",
      }),
    ).resolves.toEqual({
      status: "refused",
      reason: "missing-correlated-mutation",
    });
  });

  test("retains the previous bundle when recovery is partial", async () => {
    const initial = await settleCrewReservationManifest({
      definition: preparedCrewReservationNet,
      history: settledHistory(),
      settledAt: "2026-09-03T12:00:00.000Z",
    });
    if (initial.status !== "settled") {
      throw new Error("Expected the prepared fixture to settle");
    }

    await expect(
      settleCrewReservationManifest({
        definition: preparedCrewReservationNet,
        history: {
          ...settledHistory(),
          conversationId: "different-conversation",
        },
        previous: initial.manifest,
        settledAt: "2026-09-03T12:05:00.000Z",
      }),
    ).resolves.toEqual({
      status: "refused",
      reason: "conversation-mismatch",
    });

    await expect(
      settleCrewReservationManifest({
        definition: preparedCrewReservationNet,
        history: {
          ...settledHistory(),
          settlements: [],
        },
        previous: initial.manifest,
        settledAt: "2026-09-03T12:05:00.000Z",
      }),
    ).resolves.toEqual({
      status: "refused",
      reason: "missing-completed-settlement",
    });
  });

  test("does not publish a new revision for an unchanged coherent bundle", async () => {
    const initial = await settleCrewReservationManifest({
      definition: preparedCrewReservationNet,
      history: settledHistory(),
      settledAt: "2026-09-03T12:00:00.000Z",
    });
    if (initial.status !== "settled") {
      throw new Error("Expected the prepared fixture to settle");
    }

    await expect(
      settleCrewReservationManifest({
        definition: preparedCrewReservationNet,
        history: { ...settledHistory(), offset: "11" },
        previous: initial.manifest,
        settledAt: "2026-09-03T12:05:00.000Z",
      }),
    ).resolves.toEqual(initial);
  });

  test("keeps the prepared bundle selected when the document changes first", async () => {
    const initial = await settleCrewReservationManifest({
      definition: preparedCrewReservationNet,
      history: settledHistory(),
      settledAt: "2026-09-03T12:00:00.000Z",
    });
    if (initial.status !== "settled") {
      throw new Error("Expected the prepared fixture to settle");
    }
    const partialDefinition = structuredClone(preparedCrewReservationNet);
    const startInspection = partialDefinition.transitions.find(
      ({ id }) => id === startFinalInspectionTransitionId,
    );
    if (startInspection === undefined) {
      throw new Error("Missing prepared start-inspection transition");
    }
    startInspection.inputArcs.push({
      placeId: dispatchCrewPlaceId,
      type: "standard",
      weight: 1,
    });

    await expect(
      settleCrewReservationManifest({
        definition: partialDefinition,
        history: settledHistory(),
        previous: initial.manifest,
        settledAt: "2026-09-03T12:05:00.000Z",
      }),
    ).resolves.toEqual({
      status: "refused",
      reason: "bundle-mismatch",
    });
  });
});
