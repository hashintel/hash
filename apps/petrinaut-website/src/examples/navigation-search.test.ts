import { describe, expect, it } from "vitest";

import {
  navigationStateToSharedSearch,
  sharedSearchToNavigationState,
} from "./navigation-search";

describe("navigation state projection", () => {
  it("round-trips scenario, subnet, and selection", () => {
    const state = sharedSearchToNavigationState({
      scenario: "none",
      subnet: "subnet-1",
      itemType: "place",
      itemId: "place-1",
    });

    expect(state.scenarioId).toBeNull();
    expect(state.subnetId).toBe("subnet-1");
    expect(state.selection).toEqual([{ type: "place", id: "place-1" }]);
    expect(navigationStateToSharedSearch(state)).toEqual({
      scenario: "none",
      subnet: "subnet-1",
      itemType: "place",
      itemId: "place-1",
    });
  });

  it("distinguishes an explicit no-scenario choice from an absent one", () => {
    expect(sharedSearchToNavigationState({}).scenarioId).toBeUndefined();
    expect(
      sharedSearchToNavigationState({ scenario: "none" }).scenarioId,
    ).toBeNull();
    expect(
      navigationStateToSharedSearch(sharedSearchToNavigationState({})).scenario,
    ).toBeUndefined();
  });

  it("takes editor defaults for fields the URL does not carry", () => {
    const state = sharedSearchToNavigationState({ subnet: "subnet-1" });

    expect(state.mode).toBe("edit");
    expect(state.overlay).toBeNull();
    expect(state.simulateResource).toBeNull();
  });
});
