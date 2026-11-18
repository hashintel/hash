import { use } from "react";

import { ADAPTIVE_SIMULATOR_ID } from "@hashintel/petrinaut-core";

import { SimulationContext } from "../../../../../../../react/simulation/context";
import {
  EditorContext,
  type TimelineView,
} from "../../../../../../../react/state/editor-context";
import { SDCPNContext } from "../../../../../../../react/state/sdcpn-context";
import { placesWithDynamics } from "./series-config/solver-error";

const PER_PLACE_VIEW: TimelineView = { kind: "per-place" };

/**
 * Whether a run records the solver's error: only the adaptive simulator
 * does, and only for the places it integrates.
 */
export const useSolverErrorAvailable = (): boolean => {
  const {
    petriNetDefinition: { places },
  } = use(SDCPNContext);
  const { simulatorSelection } = use(SimulationContext);
  return (
    simulatorSelection.simulatorId === ADAPTIVE_SIMULATOR_ID &&
    placesWithDynamics(places).length > 0
  );
};

/**
 * The view the Timeline of a run draws: the picked one, or tokens per place
 * while the pick has nothing to show, which is tokens per type without
 * colours and the solver's error without a run that records it. The pick
 * itself is kept, so it returns when it applies again.
 */
export const useRunTimelineView = (): TimelineView => {
  const { timelineView } = use(EditorContext);
  const { extensions } = use(SDCPNContext);
  const solverErrorAvailable = useSolverErrorAvailable();

  switch (timelineView.kind) {
    case "per-type":
      return extensions.colors ? timelineView : PER_PLACE_VIEW;
    case "solver-error":
      return solverErrorAvailable ? timelineView : PER_PLACE_VIEW;
    default:
      return timelineView;
  }
};
