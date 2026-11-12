import { use } from "react";

import {
  SimulationContext,
  type SimulationContextValue,
  type SimulationState,
} from "../simulation/context";
import { useStore } from "../use-store";

import type {
  SimulationFrameReader,
  SimulationFrameState,
} from "@hashintel/petrinaut-core";

/**
 * Lifecycle state of the active simulation. "NotRun" when nothing has been
 * started yet.
 */
export function useSimulationStatus(): SimulationState {
  return use(SimulationContext).state;
}

/** Number of frames available right now: the events the run has recorded. */
export function useSimulationFrameCount(): number {
  return useStore(use(SimulationContext).totalFramesStore);
}

/**
 * Async access to a specific frame reader by index: the state the run
 * recorded at that event. Resolves to `null` when the index is out of range
 * or no simulation exists.
 */
export function useGetSimulationFrameReader(): (
  index: number,
) => Promise<SimulationFrameReader | null> {
  return use(SimulationContext).getFrame;
}

export const useGetSimulationFrame = useGetSimulationFrameReader;

export type SimulationActionsBundle = {
  initialize: SimulationContextValue["initialize"];
  run: SimulationContextValue["run"];
  pause: SimulationContextValue["pause"];
  reset: SimulationContextValue["reset"];
};

/** Bundle of simulation control actions. */
export function useSimulationActions(): SimulationActionsBundle {
  const ctx = use(SimulationContext);
  return {
    initialize: ctx.initialize,
    run: ctx.run,
    pause: ctx.pause,
    reset: ctx.reset,
  };
}

/**
 * The current simulation parameters as the user has configured them.
 * Includes scenario-overridden values when a scenario is selected. A time
 * step, where the selected simulator has one, is among the simulator's own
 * parameters.
 */
export function useSimulationParameters(): {
  parameterValues: Record<string, string>;
  initialMarking: SimulationContextValue["initialMarking"];
  maxTime: number | null;
  /** The simulator the next run is computed by, with its parameter values. */
  simulator: SimulationContextValue["simulatorSelection"];
} {
  const ctx = use(SimulationContext);
  return {
    parameterValues: ctx.parameterValues,
    initialMarking: ctx.initialMarking,
    maxTime: ctx.maxTime,
    simulator: ctx.simulatorSelection,
  };
}

/**
 * Latest simulation error message, if the simulation is in the Error state.
 * `errorItemId` is the ID of the SDCPN element that caused the error, when
 * applicable.
 */
export function useSimulationError(): {
  message: string | null;
  itemId: string | null;
} {
  const ctx = use(SimulationContext);
  return { message: ctx.error, itemId: ctx.errorItemId };
}

export type { SimulationFrameReader, SimulationFrameState, SimulationState };
