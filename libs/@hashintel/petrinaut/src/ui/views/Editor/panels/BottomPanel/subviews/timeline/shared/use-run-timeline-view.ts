import { use } from "react";

import { ADAPTIVE_SIMULATOR_ID } from "@hashintel/petrinaut-core";

import { useSDCPNState } from "../../../../../../../../react/document/sdcpn-context";
import { usePetrinautDefinitionSelector } from "../../../../../../../../react/document/use-document";
import { ExecutionTraceContext } from "../../../../../../../../react/execution-trace/context";
import { SimulationContext } from "../../../../../../../../react/simulation/context";
import {
  useEditorState,
  type TimelineView,
} from "../../../../../../../../react/state/editor-context";
import { placesWithDynamics } from "./series-config";

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
 * The view the Timeline of an execution draws: the picked one, or tokens
 * per place while the pick has nothing to show. That is tokens per type
 * without colours, the solver's error without a run that records it, and a
 * metric or that error for an execution the host reports, which carries
 * token counts and no solver. The pick itself is kept, so it returns when
 * it applies again.
 */
export const useRunTimelineView = (): TimelineView => {
  const timelineView = useEditorState((editor) => editor.timelineView);
  const colorsEnabled = useSDCPNState((document) => document.extensions.colors);
  const solverErrorAvailable = useSolverErrorAvailable();
  const reportedByHost = use(ExecutionTraceContext).origin === "host";

  switch (timelineView.kind) {
    case "per-type":
      return colorsEnabled ? timelineView : PER_PLACE_VIEW;
    case "solver-error":
      return solverErrorAvailable && !reportedByHost
        ? timelineView
        : PER_PLACE_VIEW;
    case "metric":
      return reportedByHost ? PER_PLACE_VIEW : timelineView;
    default:
      return timelineView;
  }
};
