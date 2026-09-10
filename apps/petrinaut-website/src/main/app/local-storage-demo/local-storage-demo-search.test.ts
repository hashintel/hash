import { describe, expect, test } from "vitest";

import {
  isCrewReservationFixtureSelected,
  localStorageDemoRouteIdentity,
  validateLocalStorageDemoSearch,
  withBrunchFixtureKey,
} from "./local-storage-demo-search";
import { crewReservationFixtureId } from "./prepared-crew-reservation-fixture";

describe("local storage demo search", () => {
  test("keeps conversation construction distinct from retained prepared and ordinary modes", () => {
    const search = validateLocalStorageDemoSearch({
      brunchTracer: "construction",
    });
    expect(localStorageDemoRouteIdentity(search)).toBe(
      "construction-candidate",
    );
    expect(
      localStorageDemoRouteIdentity({
        "brunch-fixture": crewReservationFixtureId,
        brunchTracer: "root-arc",
      }),
    ).toBe("root-arc-tracer");
    expect(
      withBrunchFixtureKey(search, { itemType: "arc", itemId: "arc" })
        .brunchTracer,
    ).toBe("construction");
    expect(isCrewReservationFixtureSelected(search)).toBe(false);
  });
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

  test("treats inventory-purchasing as a document scenario location, not a catalogue bundle", () => {
    const search = validateLocalStorageDemoSearch({
      scenario: "inventory-purchasing",
    });
    expect(search.scenario).toBe("inventory-purchasing");
    expect(localStorageDemoRouteIdentity(search)).toBe("ordinary");
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
