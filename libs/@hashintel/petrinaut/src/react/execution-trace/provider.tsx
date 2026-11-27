/**
 * @layerRoot react.execution-trace
 * @role Says which execution the editor shows: the run a simulation computes, or the one the host reports in Actual mode
 */

import { use } from "react";

import { SimulationContext } from "../simulation/context";
import { useEditorState } from "../state/editor-context";
import { ExecutionTraceContext, type ViewedExecution } from "./context";
import { useActualModeTrace } from "./use-actual-mode-trace";

import type { FC, PropsWithChildren } from "react";

/**
 * Routes {@link ExecutionTraceContext} to the execution of the editor's
 * global mode: the host's in Actual mode, the simulation's otherwise. This
 * is the only place that knows there are two: below it there is a trace.
 */
export const ExecutionTraceProvider: FC<PropsWithChildren> = ({ children }) => {
  const isActualMode = useEditorState(
    (editor) => editor.globalMode === "actual",
  );
  const { eventSimulation, playbackSource, clock, continuity } =
    use(SimulationContext);
  const actualTrace = useActualModeTrace({ enabled: isActualMode });

  const value: ViewedExecution = isActualMode
    ? {
        origin: "host",
        trace: actualTrace,
        playable: actualTrace,
        clock: actualTrace?.clock ?? "time",
        continuity: actualTrace?.continuity ?? "discrete",
      }
    : {
        origin: "simulation",
        trace: eventSimulation?.trace ?? null,
        playable: playbackSource,
        clock,
        continuity,
      };

  return (
    <ExecutionTraceContext value={value}>{children}</ExecutionTraceContext>
  );
};
