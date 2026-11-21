import { use } from "react";

import { ADAPTIVE_SIMULATOR_ID } from "@hashintel/petrinaut-core";

import { usePetrinautDefinitionSelector } from "../../../../../../../react/hooks/use-document";
import { SimulationContext } from "../../../../../../../react/simulation/context";
import {
  useEditorState,
  type TimelineView,
} from "../../../../../../../react/state/editor-context";
import { useSDCPNState } from "../../../../../../../react/state/sdcpn-context";
import { placesWithDynamics } from "./series-config/solver-error";

/** The view a timeline draws when the picked one has nothing to show. */
export const PER_PLACE_VIEW: TimelineView = { kind: "per-place" };

/**
 * Whether a run records the solver's error: only the adaptive simulator
 * does, and only for the places it integrates.
 */
export const useSolverErrorAvailable = (): boolean => {
  const hasDynamics = usePetrinautDefinitionSelector(
    (net) => placesWithDynamics(net.places).length > 0,
  );
  const { simulatorSelection } = use(SimulationContext);
  return (
    simulatorSelection.simulatorId === ADAPTIVE_SIMULATOR_ID && hasDynamics
  );
};

/**
 * The view the Timeline of a run draws: the picked one, or tokens per place
 * while the pick has nothing to show, which is tokens per type without
 * colours and the solver's error without a run that records it. The pick
 * itself is kept, so it returns when it applies again.
 */
export const useRunTimelineView = (): TimelineView => {
  const timelineView = useEditorState((editor) => editor.timelineView);
  const colorsEnabled = useSDCPNState((document) => document.extensions.colors);
  const solverErrorAvailable = useSolverErrorAvailable();

  switch (timelineView.kind) {
    case "per-type":
      return colorsEnabled ? timelineView : PER_PLACE_VIEW;
    case "solver-error":
      return solverErrorAvailable ? timelineView : PER_PLACE_VIEW;
    default:
      return timelineView;
  }
};
