import { describe, expect, test } from "vitest";

import {
  crewReservationFixtureClientToolNames,
  crewReservationFixtureId,
  dispatchCrewPlaceId,
  isCrewReservationFixtureSelected,
  preparedCrewReservationDelivery,
  preparedCrewReservationNet,
  preparedCrewReservationWorkpiece,
  startFinalInspectionTransitionId,
} from "./prepared-crew-reservation-fixture";

const transitionById = (transitionId: string) => {
  const transition = preparedCrewReservationNet.transitions.find(
    (candidate) => candidate.id === transitionId,
  );
  if (transition === undefined) {
    throw new Error(`Missing prepared transition ${transitionId}`);
  }
  return transition;
};

describe("prepared crew-reservation fixture", () => {
  test("advertises only the selected canonical read and mutation", () => {
    expect(crewReservationFixtureClientToolNames).toEqual([
      "getLatestNetDefinition",
      "addArc",
    ]);
  });

  test("has the batch flow and crew return but omits the target input arc", () => {
    const startInspection = transitionById(startFinalInspectionTransitionId);
    const signOff = transitionById("sign-off");

    expect(startInspection.inputArcs).toContainEqual({
      placeId: "batch-ready",
      type: "standard",
      weight: 1,
    });
    expect(startInspection.inputArcs).not.toContainEqual(
      expect.objectContaining({ placeId: dispatchCrewPlaceId }),
    );
    expect(signOff.outputArcs).toEqual(
      expect.arrayContaining([
        { placeId: "ready-for-dispatch", weight: 1 },
        { placeId: dispatchCrewPlaceId, weight: 1 },
      ]),
    );
  });

  test("carries the quantity, unknowns, and honest claim boundary", () => {
    expect(preparedCrewReservationWorkpiece).toContain(
      "Exactly one dispatch crew",
    );
    expect(preparedCrewReservationWorkpiece).toContain(
      "timing, failure modes, and recovery behavior remain unresolved",
    );
    expect(preparedCrewReservationWorkpiece).toContain(
      "not model-produced evidence",
    );
    expect(preparedCrewReservationDelivery.message.attributes).toEqual({
      fixtureId: crewReservationFixtureId,
      authorship: "test-authored",
      claimBoundary: "prepared-not-model-produced",
    });
  });

  test("selects only the explicit stable query value", () => {
    expect(
      isCrewReservationFixtureSelected(
        `?brunch-fixture=${crewReservationFixtureId}`,
      ),
    ).toBe(true);
    expect(
      isCrewReservationFixtureSelected("?brunch-fixture=another-fixture"),
    ).toBe(false);
    expect(isCrewReservationFixtureSelected("")).toBe(false);
  });
});
