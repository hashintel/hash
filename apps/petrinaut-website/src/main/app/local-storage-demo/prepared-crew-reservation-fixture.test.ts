import { describe, expect, test } from "vitest";

import {
  CREW_RESERVATION_CLIENT_TOOL_NAMES,
  CREW_RESERVATION_FIXTURE_ID,
  DISPATCH_CREW_PLACE_ID,
  isCrewReservationFixtureSelected,
  preparedCrewReservationDelivery,
  preparedCrewReservationNet,
  preparedCrewReservationWorkpiece,
  START_FINAL_INSPECTION_TRANSITION_ID,
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
    expect(CREW_RESERVATION_CLIENT_TOOL_NAMES).toEqual([
      "getLatestNetDefinition",
      "addArc",
    ]);
  });

  test("has the batch flow and crew return but omits the target input arc", () => {
    const startInspection = transitionById(
      START_FINAL_INSPECTION_TRANSITION_ID,
    );
    const signOff = transitionById("sign-off");

    expect(startInspection.inputArcs).toContainEqual({
      placeId: "batch-ready",
      type: "standard",
      weight: 1,
    });
    expect(startInspection.inputArcs).not.toContainEqual(
      expect.objectContaining({ placeId: DISPATCH_CREW_PLACE_ID }),
    );
    expect(signOff.outputArcs).toEqual(
      expect.arrayContaining([
        { placeId: "ready-for-dispatch", weight: 1 },
        { placeId: DISPATCH_CREW_PLACE_ID, weight: 1 },
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
      fixtureId: CREW_RESERVATION_FIXTURE_ID,
      authorship: "test-authored",
      claimBoundary: "prepared-not-model-produced",
    });
  });

  test("selects only the explicit stable query value", () => {
    expect(
      isCrewReservationFixtureSelected(
        `?brunch-fixture=${CREW_RESERVATION_FIXTURE_ID}`,
      ),
    ).toBe(true);
    expect(
      isCrewReservationFixtureSelected("?brunch-fixture=another-fixture"),
    ).toBe(false);
    expect(isCrewReservationFixtureSelected("")).toBe(false);
  });
});
