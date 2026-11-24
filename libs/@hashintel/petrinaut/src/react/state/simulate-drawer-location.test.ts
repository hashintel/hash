import { expect, test } from "vitest";

import { defaultPetrinautNavigationState } from "../navigation/navigation";
import {
  navigationResourceToSimulateDrawer,
  simulateDrawerToNavigationOverlay,
  simulateDrawerToNavigationResource,
} from "./simulate-drawer-location";

test("maps view resources and create overlays to drawers", () => {
  const openExperiment = { type: "experiment", id: "experiment-a" } as const;
  const withOpenExperiment = {
    ...defaultPetrinautNavigationState,
    simulateResource: openExperiment,
  };
  const empty = defaultPetrinautNavigationState;

  expect(
    simulateDrawerToNavigationResource(
      { type: "view-scenario", scenarioId: "scenario-a" },
      empty,
    ),
  ).toEqual({ type: "scenario", id: "scenario-a" });

  for (const type of [
    "create-scenario",
    "create-metric",
    "create-experiment",
  ] as const) {
    const drawer = { type };
    // A create drawer layers over the open record rather than replacing it.
    expect(
      simulateDrawerToNavigationResource(drawer, withOpenExperiment),
    ).toEqual(openExperiment);
    expect(simulateDrawerToNavigationResource(drawer, empty)).toBeNull();
    expect(simulateDrawerToNavigationOverlay(drawer, null)).toEqual(drawer);
    expect(navigationResourceToSimulateDrawer(null, drawer)).toEqual(drawer);
  }
  // Closing a create overlay reveals the record it was layered over, while
  // closing the record's own drawer clears it.
  expect(
    simulateDrawerToNavigationResource(
      { type: "closed" },
      {
        ...defaultPetrinautNavigationState,
        simulateResource: openExperiment,
        overlay: { type: "create-experiment" },
      },
    ),
  ).toEqual(openExperiment);
  expect(
    simulateDrawerToNavigationResource(
      { type: "closed" },
      {
        ...defaultPetrinautNavigationState,
        simulateResource: openExperiment,
        overlay: null,
      },
    ),
  ).toBeNull();
  expect(
    navigationResourceToSimulateDrawer({
      type: "experiment",
      id: "experiment-a",
    }),
  ).toEqual({ type: "view-experiment", experimentId: "experiment-a" });
  expect(navigationResourceToSimulateDrawer(null)).toEqual({
    type: "closed",
  });
});
