/**
 * @vitest-environment jsdom
 */
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import {
  preparedWorkpieceAuthorship,
  preparedWorkpieceClaimBoundary,
  preparedWorkpieceSignalTag,
} from "@hashintel/brunch-agent/workpiece";

import { crewReservationSettledManifestStorageKey } from "./crew-reservation-settled-manifest";
import {
  crewReservationFixtureId,
  dispatchCrewPlaceId,
  preparedCrewReservationNet,
  preparedCrewReservationWorkpiece,
  startFinalInspectionTransitionId,
} from "./prepared-crew-reservation-fixture";
import {
  useCrewReservationSettlement,
  useCrewReservationSettledManifestStorage,
} from "./use-crew-reservation-settled-manifest";

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
        tagName: preparedWorkpieceSignalTag,
        attributes: {
          fixtureId: crewReservationFixtureId,
          authorship: preparedWorkpieceAuthorship,
          claimBoundary: preparedWorkpieceClaimBoundary,
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
  const persistCoherentSnapshot = vi.fn();
  const { result, rerender } = renderHook(
    ({ definition }: { definition: typeof preparedCrewReservationNet }) => {
      const storage = useCrewReservationSettledManifestStorage();
      const status = useCrewReservationSettlement({
        definition,
        enabled: true,
        history: preparedHistory,
        historyError: undefined,
        persistCoherentSnapshot,
        preparationError: undefined,
        setSettledManifest: storage.setSettledManifest,
        settledManifest: storage.settledManifest,
        snapshotMissing: false,
      });
      return { ...storage, status };
    },
    { initialProps: { definition: preparedCrewReservationNet } },
  );

  await waitFor(() => expect(result.current.status.state).toBe("settled"));
  const settledManifest = result.current.settledManifest;
  expect(settledManifest?.revision).toBe(0);
  expect(persistCoherentSnapshot).toHaveBeenCalledWith(
    settledManifest?.document.sha256,
    preparedCrewReservationNet,
  );

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
  rerender({ definition: partialDefinition });

  await waitFor(() => expect(result.current.status.state).toBe("refused"));
  expect(result.current.settledManifest).toEqual(settledManifest);
  expect(
    JSON.parse(
      window.localStorage.getItem(crewReservationSettledManifestStorageKey) ??
        "null",
    ),
  ).toEqual(settledManifest);
});

test("surfaces canonical history failure without publishing a bundle", async () => {
  const persistCoherentSnapshot = vi.fn();
  const { result } = renderHook(() => {
    const storage = useCrewReservationSettledManifestStorage();
    const status = useCrewReservationSettlement({
      definition: preparedCrewReservationNet,
      enabled: true,
      history: undefined,
      historyError: "History unavailable.",
      persistCoherentSnapshot,
      preparationError: undefined,
      setSettledManifest: storage.setSettledManifest,
      settledManifest: storage.settledManifest,
      snapshotMissing: false,
    });
    return { ...storage, status };
  });

  await waitFor(() => expect(result.current.status.state).toBe("refused"));
  expect(result.current.status).toEqual({
    state: "refused",
    reason: "history-unavailable",
    detail: "History unavailable.",
  });
  expect(result.current.settledManifest).toBeNull();
});

test("distinguishes preparation failure from unavailable history", async () => {
  const persistCoherentSnapshot = vi.fn();
  const { result } = renderHook(() => {
    const storage = useCrewReservationSettledManifestStorage();
    const status = useCrewReservationSettlement({
      definition: preparedCrewReservationNet,
      enabled: true,
      history: undefined,
      historyError: undefined,
      persistCoherentSnapshot,
      preparationError: "Provider authentication failed.",
      setSettledManifest: storage.setSettledManifest,
      settledManifest: storage.settledManifest,
      snapshotMissing: false,
    });
    return { ...storage, status };
  });

  expect(result.current.status).toEqual({
    state: "refused",
    reason: "preparation-failed",
    detail: "Provider authentication failed.",
  });
  expect(result.current.settledManifest).toBeNull();
});
