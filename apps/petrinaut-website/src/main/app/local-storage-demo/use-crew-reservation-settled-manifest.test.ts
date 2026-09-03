/**
 * @vitest-environment jsdom
 */
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test } from "vitest";

import {
  PREPARED_WORKPIECE_AUTHORSHIP,
  PREPARED_WORKPIECE_CLAIM_BOUNDARY,
  PREPARED_WORKPIECE_SIGNAL_TAG,
} from "@hashintel/brunch-agent/workpiece";

import { CREW_RESERVATION_SETTLED_MANIFEST_STORAGE_KEY } from "./crew-reservation-settled-manifest";
import {
  CREW_RESERVATION_FIXTURE_ID,
  DISPATCH_CREW_PLACE_ID,
  preparedCrewReservationNet,
  preparedCrewReservationWorkpiece,
  START_FINAL_INSPECTION_TRANSITION_ID,
} from "./prepared-crew-reservation-fixture";
import { useCrewReservationSettledManifest } from "./use-crew-reservation-settled-manifest";

const preparedHistory = {
  conversationId: "canonical-conversation",
  offset: "2",
  settlements: [{ submissionId: "prepare-submission", outcome: "completed" }],
  messages: [
    {
      id: "prepared-message",
      role: "system",
      purpose: "dispatch",
      submissionId: "prepare-submission",
      signal: {
        tagName: PREPARED_WORKPIECE_SIGNAL_TAG,
        attributes: {
          fixtureId: CREW_RESERVATION_FIXTURE_ID,
          authorship: PREPARED_WORKPIECE_AUTHORSHIP,
          claimBoundary: PREPARED_WORKPIECE_CLAIM_BOUNDARY,
        },
      },
      parts: [{ type: "text", text: preparedCrewReservationWorkpiece }],
    },
  ],
};

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

test("keeps the prior runtime bundle selected while a document write is partial", async () => {
  const { result, rerender } = renderHook(
    ({ definition }: { definition: typeof preparedCrewReservationNet }) =>
      useCrewReservationSettledManifest({
        definition,
        enabled: true,
        history: preparedHistory,
        historyError: undefined,
      }),
    { initialProps: { definition: preparedCrewReservationNet } },
  );

  await waitFor(() => expect(result.current.status.state).toBe("settled"));
  const settledManifest = result.current.settledManifest;
  expect(settledManifest?.revision).toBe(0);

  const partialDefinition = structuredClone(preparedCrewReservationNet);
  const startInspection = partialDefinition.transitions.find(
    ({ id }) => id === START_FINAL_INSPECTION_TRANSITION_ID,
  );
  if (startInspection === undefined) {
    throw new Error("Missing prepared start-inspection transition");
  }
  startInspection.inputArcs.push({
    placeId: DISPATCH_CREW_PLACE_ID,
    type: "standard",
    weight: 1,
  });
  rerender({ definition: partialDefinition });

  await waitFor(() => expect(result.current.status.state).toBe("refused"));
  expect(result.current.settledManifest).toEqual(settledManifest);
  expect(
    JSON.parse(
      window.localStorage.getItem(
        CREW_RESERVATION_SETTLED_MANIFEST_STORAGE_KEY,
      ) ?? "null",
    ),
  ).toEqual(settledManifest);
});

test("surfaces canonical history failure without publishing a bundle", async () => {
  const { result } = renderHook(() =>
    useCrewReservationSettledManifest({
      definition: preparedCrewReservationNet,
      enabled: true,
      history: undefined,
      historyError: "History unavailable.",
    }),
  );

  await waitFor(() => expect(result.current.status.state).toBe("refused"));
  expect(result.current.status).toEqual({
    state: "refused",
    reason: "history-unavailable",
    detail: "History unavailable.",
  });
  expect(result.current.settledManifest).toBeNull();
});
