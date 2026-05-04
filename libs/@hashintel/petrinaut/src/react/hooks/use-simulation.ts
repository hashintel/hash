import { use } from "react";

import type {
  SimulationFrame,
  SimulationFrameState,
} from "../../core/simulation/types";
import {
  SimulationContext,
  type SimulationContextValue,
  type SimulationState,
} from "../simulation/context";

/**
 * Lifecycle state of the active simulation. "NotRun" when nothing has been
 * started yet.
 */
export function useSimulationStatus(): SimulationState {
  return use(SimulationContext).state;
}

/** Total number of computed frames available right now. */
export function useSimulationFrameCount(): number {
  return use(SimulationContext).totalFrames;
}

/**
 * Async access to a specific frame by index. Resolves to `null` when the index
 * is out of range or no simulation exists.
 */
export function useGetSimulationFrame(): (
  index: number,
) => Promise<SimulationFrame | null> {
  return use(SimulationContext).getFrame;
}

export type SimulationActionsBundle = {
  initialize: SimulationContextValue["initialize"];
  run: SimulationContextValue["run"];
  pause: SimulationContextValue["pause"];
  reset: SimulationContextValue["reset"];
  ack: SimulationContextValue["ack"];
  setBackpressure: SimulationContextValue["setBackpressure"];
};

/** Bundle of simulation control actions. */
export function useSimulationActions(): SimulationActionsBundle {
  const ctx = use(SimulationContext);
  return {
    initialize: ctx.initialize,
    run: ctx.run,
    pause: ctx.pause,
    reset: ctx.reset,
    ack: ctx.ack,
    setBackpressure: ctx.setBackpressure,
  };
}

/**
 * The current simulation parameters as the user has configured them.
 * Includes scenario-overridden values when a scenario is selected.
 */
export function useSimulationParameters(): {
  parameterValues: Record<string, string>;
  initialMarking: SimulationContextValue["initialMarking"];
  dt: number;
  maxTime: number | null;
} {
  const ctx = use(SimulationContext);
  return {
    parameterValues: ctx.parameterValues,
    initialMarking: ctx.initialMarking,
    dt: ctx.dt,
    maxTime: ctx.maxTime,
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

export type { SimulationFrame, SimulationFrameState, SimulationState };
