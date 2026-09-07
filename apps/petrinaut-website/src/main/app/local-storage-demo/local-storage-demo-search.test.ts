import { describe, expect, test } from "vitest";

import {
  isCrewReservationFixtureSelected,
  localStorageDemoRouteIdentity,
  validateLocalStorageDemoSearch,
  withBrunchFixtureKey,
} from "./local-storage-demo-search";
import { crewReservationFixtureId } from "./prepared-crew-reservation-fixture";

describe("local storage demo search", () => {
  test("owns the fixture key beside the shared contract", () => {
    expect(
      validateLocalStorageDemoSearch({
        "brunch-fixture": crewReservationFixtureId,
        itemType: "place",
        itemId: "place-1",
      }),
    ).toEqual({
      "brunch-fixture": crewReservationFixtureId,
      itemType: "place",
      itemId: "place-1",
    });
    expect(validateLocalStorageDemoSearch({ "brunch-fixture": 7 })).toEqual({});
  });

  test("carries the fixture key across a shared-contract write", () => {
    expect(
      withBrunchFixtureKey(
        { "brunch-fixture": crewReservationFixtureId, subnet: "subnet-1" },
        { itemType: "place", itemId: "place-1" },
      ),
    ).toEqual({
      "brunch-fixture": crewReservationFixtureId,
      itemType: "place",
      itemId: "place-1",
    });
  });

  test("changes route identity only when fixture mode changes", () => {
    expect(localStorageDemoRouteIdentity({})).toBe("ordinary");
    expect(localStorageDemoRouteIdentity({ subnet: "subnet-1" })).toBe(
      "ordinary",
    );
    expect(
      localStorageDemoRouteIdentity({
        "brunch-fixture": crewReservationFixtureId,
      }),
    ).toBe(crewReservationFixtureId);
  });

  test("selects only the explicit stable fixture value", () => {
    expect(
      isCrewReservationFixtureSelected({
        "brunch-fixture": crewReservationFixtureId,
      }),
    ).toBe(true);
    expect(
      isCrewReservationFixtureSelected({ "brunch-fixture": "another-fixture" }),
    ).toBe(false);
    expect(isCrewReservationFixtureSelected({})).toBe(false);
  });
});
