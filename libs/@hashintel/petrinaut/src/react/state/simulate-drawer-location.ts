import type {
  PetrinautNavigationOverlay,
  PetrinautNavigationState,
  PetrinautSimulateResource,
} from "../navigation/navigation";
import type { SimulateDrawerState } from "./editor-context";

export const simulateDrawerToNavigationResource = (
  drawer: SimulateDrawerState,
  current: Readonly<PetrinautNavigationState>,
): PetrinautSimulateResource | null => {
  switch (drawer.type) {
    case "view-scenario":
      return { type: "scenario", id: drawer.scenarioId };
    case "view-metric":
      return { type: "metric", id: drawer.metricId };
    case "view-experiment":
      return { type: "experiment", id: drawer.experimentId };
    // A create drawer opens above whatever record is already open, the way
    // `simulateDrawerToNavigationOverlay` keeps the overlay behind it.
    case "create-scenario":
    case "create-metric":
    case "create-experiment":
      return current.simulateResource;
    // `closed` means whichever drawer is on top. Closing a create overlay
    // reveals the record it was layered over; closing that record's own
    // drawer clears it.
    case "closed":
      return current.overlay?.type.startsWith("create-")
        ? current.simulateResource
        : null;
  }
};

export const simulateDrawerToNavigationOverlay = (
  drawer: SimulateDrawerState,
  current: PetrinautNavigationOverlay,
): PetrinautNavigationOverlay => {
  switch (drawer.type) {
    case "create-scenario":
    case "create-metric":
    case "create-experiment":
      return { type: drawer.type };
    case "closed":
    case "view-scenario":
    case "view-metric":
    case "view-experiment":
      return current?.type.startsWith("create-") ? null : current;
  }
};

export const navigationResourceToSimulateDrawer = (
  resource: PetrinautSimulateResource | null,
  overlay: PetrinautNavigationOverlay = null,
): SimulateDrawerState => {
  switch (overlay?.type) {
    case "create-scenario":
    case "create-metric":
    case "create-experiment":
      return { type: overlay.type };
    case "viewport-settings":
    case "user-settings":
    case undefined:
      break;
  }
  switch (resource?.type) {
    case "scenario":
      return { type: "view-scenario", scenarioId: resource.id };
    case "metric":
      return { type: "view-metric", metricId: resource.id };
    case "experiment":
      return { type: "view-experiment", experimentId: resource.id };
    case undefined:
      return { type: "closed" };
  }
};
