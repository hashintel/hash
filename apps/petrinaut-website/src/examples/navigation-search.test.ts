import { describe, expect, it } from "vitest";

import { sharedOverlays, sharedSimulateViews } from "./example-search";
import {
  applyPreviewNavigationUpdate,
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

  it("round-trips every Simulate section and overlay the URL can name", () => {
    for (const view of sharedSimulateViews) {
      for (const overlay of sharedOverlays) {
        const state = sharedSearchToNavigationState({
          mode: "simulate",
          view,
          overlay,
        });
        expect(state.simulateView).toBe(view);
        expect(state.overlay).toEqual({ type: overlay });
        // The projection omits whatever sits at the baseline, so the property
        // is that decoding it lands on the same location.
        expect(
          sharedSearchToNavigationState(navigationStateToSharedSearch(state)),
        ).toEqual(state);
      }
    }
  });

  it("omits the fields that sit at the baseline", () => {
    const state = sharedSearchToNavigationState({
      mode: "simulate",
      view: "experiments",
    });
    expect(navigationStateToSharedSearch(state)).toEqual({
      scenario: undefined,
      subnet: undefined,
      mode: "simulate",
      view: undefined,
      overlay: undefined,
    });
  });
});

describe("preview navigation writes", () => {
  it("keeps the fields the Preview does not navigate", () => {
    // An embed can arrive carrying these: oEmbed copies the source page's mode
    // into the iframe URL. Writing the Preview's own projection alone dropped
    // them on the first selection.
    const next = applyPreviewNavigationUpdate(
      { mode: "simulate", view: "metrics", overlay: "create-experiment" },
      (current) => ({
        ...current,
        selection: [{ type: "place", id: "place-1" }],
      }),
    );

    expect(next).toMatchObject({
      mode: "simulate",
      view: "metrics",
      overlay: "create-experiment",
      itemType: "place",
      itemId: "place-1",
    });
  });

  it("still writes the fields the Preview does navigate", () => {
    const next = applyPreviewNavigationUpdate(
      { itemType: "place", itemId: "place-1" },
      (current) => ({ ...current, selection: [], subnetId: "subnet-2" }),
    );

    expect(next.subnet).toBe("subnet-2");
    expect(next.itemId).toBeUndefined();
  });
});
