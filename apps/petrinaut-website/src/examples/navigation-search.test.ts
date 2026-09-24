import { describe, expect, it } from "vitest";

import {
  canonicalSearchString,
  sharedOverlays,
  sharedSimulateViews,
  validateSharedExampleSearch,
} from "./example-search";
import {
  applyPreviewNavigationUpdate,
  navigationStateToSharedSearch,
  sharedSearchToNavigationState,
} from "./navigation-search";

describe("navigation state projection", () => {
  it.each([
    { mode: "edit", editView: "canvas" },
    { mode: "edit", editView: "definitions" },
    { mode: "actual", editView: "canvas" },
  ] as const)(
    "round-trips $mode/$editView URLs with remembered simulation resources",
    (destination) => {
      const baseline = sharedSearchToNavigationState({
        mode: destination.mode,
      });
      for (const resourceType of ["scenario", "experiment"] as const) {
        for (const presentation of [undefined, "fullscreen"] as const) {
          const state = {
            ...sharedSearchToNavigationState(
              { resourceType, resourceId: "record / one", presentation },
              baseline,
            ),
            ...destination,
          };
          const url = canonicalSearchString(
            navigationStateToSharedSearch(state, baseline),
          );
          const search = validateSharedExampleSearch(
            Object.fromEntries(new URLSearchParams(url)),
          );
          expect(sharedSearchToNavigationState(search, baseline)).toEqual(
            state,
          );
        }
      }
    },
  );

  it("routes Definitions within Edit and preserves the selection in shared links", () => {
    const search = {
      editView: "definitions",
      itemType: "transition",
      itemId: "collision",
    } as const;
    const state = sharedSearchToNavigationState(search);
    expect(state.mode).toBe("edit");
    expect(state.editView).toBe("definitions");
    expect(navigationStateToSharedSearch(state)).toMatchObject(search);
    expect(
      applyPreviewNavigationUpdate(search, (current) => current),
    ).toMatchObject(search);
    expect(sharedSearchToNavigationState({}).editView).toBe("canvas");
  });

  it.each([{ mode: "notebook" }, { editView: "notebook" }])(
    "opens legacy Notebook links in the Edit workspace: %s",
    (legacy) => {
      const search = validateSharedExampleSearch({
        ...legacy,
        itemType: "place",
        itemId: "space",
      });
      expect(search).toMatchObject({
        editView: "definitions",
        itemId: "space",
      });
      expect(sharedSearchToNavigationState(search)).toMatchObject({
        mode: "edit",
        editView: "definitions",
      });
    },
  );

  it("round-trips an expanded Properties Panel section with its selected item", () => {
    const search = {
      itemType: "transition",
      itemId: "collision",
      expandedPanel: "transition-properties",
      expandedSection: "transition-results",
    } as const;
    const state = sharedSearchToNavigationState(search);
    expect(state.expandedSubView).toEqual({
      container: search.expandedPanel,
      id: search.expandedSection,
    });
    expect(navigationStateToSharedSearch(state)).toMatchObject(search);
    expect(
      sharedSearchToNavigationState({
        itemType: "transition",
        itemId: "collision",
      }).expandedSubView,
    ).toBeNull();
    expect(
      applyPreviewNavigationUpdate(search, (current) => current),
    ).toMatchObject(search);
  });

  it.each(["scenario", "experiment"] as const)(
    "opens a direct %s link and preserves its presentation through Preview",
    (resourceType) => {
      const search = {
        resourceType,
        resourceId: "record / one",
        presentation: "fullscreen" as const,
      };
      const state = sharedSearchToNavigationState(search);
      expect(state.mode).toBe("simulate");
      expect(state.simulateView).toBe(
        resourceType === "scenario" ? "scenarios" : "experiments",
      );
      expect(state.simulateResource).toEqual({
        type: resourceType,
        id: "record / one",
      });
      expect(state.simulatePresentation).toBe("fullscreen");
      expect(navigationStateToSharedSearch(state)).toMatchObject(search);
      expect(
        applyPreviewNavigationUpdate(search, (current) => ({
          ...current,
          subnetId: "subnet",
        })),
      ).toMatchObject(search);
    },
  );

  it.each(["general", "viewport", "labs"] as const)(
    "round-trips the %s settings section in Simulate",
    (settings) => {
      const search = {
        mode: "simulate",
        view: "metrics",
        overlay: "user-settings",
        settings,
      } as const;
      const state = sharedSearchToNavigationState(search);
      expect(state.overlay).toEqual({
        type: "user-settings",
        section: settings,
      });
      expect(navigationStateToSharedSearch(state)).toMatchObject(search);
      expect(
        applyPreviewNavigationUpdate(search, (current) => current),
      ).toMatchObject(search);
      expect(
        sharedSearchToNavigationState({ mode: "simulate", view: "metrics" })
          .overlay,
      ).toBeNull();
    },
  );

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
