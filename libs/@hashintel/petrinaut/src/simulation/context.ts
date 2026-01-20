import { createContext } from "react";

import type { SimulationInstance } from "./simulator/types";

export type SimulationState =
  | "NotRun"
  | "Running"
  | "Complete"
  | "Error"
  | "Paused";

/**
 * State of a transition within a simulation frame.
 *
 * Contains timing information and firing counts for tracking transition behavior
 * during simulation execution.
 */
export type SimulationFrameState_Transition = {
  /**
   * Time elapsed since this transition last fired, in milliseconds.
   * Resets to 0 when the transition fires.
   */
  timeSinceLastFiringMs: number;
  /**
   * Whether this transition fired in this specific frame.
   * True only during the frame when the firing occurred.
   */
  firedInThisFrame: boolean;
  /**
   * Total cumulative count of times this transition has fired
   * since the start of the simulation (frame 0).
   */
  firingCount: number;
};

/**
 * State of a simulation frame.
 */
export type SimulationFrameState = {
  number: number;
  time: number;
  places: {
    [placeId: string]:
      | {
          /** Number of tokens in the place at the time of the frame. */
          tokenCount: number;
        }
      | undefined;
  };
  transitions: {
    [transitionId: string]: SimulationFrameState_Transition | undefined;
  };
};

export type InitialMarking = Map<
  string,
  { values: Float64Array; count: number }
>;

/**
 * The combined simulation context containing both state and actions.
 */
export type SimulationContextValue = {
  // State values
  simulation: SimulationInstance | null;
  state: SimulationState;
  error: string | null;
  errorItemId: string | null;
  parameterValues: Record<string, string>;
  initialMarking: InitialMarking;
  /**
   * The currently viewed simulation frame state.
   * Null when no simulation is running or no frames exist.
   */
  currentViewedFrame: SimulationFrameState | null;
  dt: number;

  // Actions
  setInitialMarking: (
    placeId: string,
    marking: { values: Float64Array; count: number },
  ) => void;
  setParameterValue: (parameterId: string, value: string) => void;
  setDt: (dt: number) => void;
  initializeParameterValuesFromDefaults: () => void;
  initialize: (params: { seed: number; dt: number }) => void;
  run: () => void;
  pause: () => void;
  reset: () => void;
  setCurrentViewedFrame: (frameIndex: number) => void;
};

const DEFAULT_CONTEXT_VALUE: SimulationContextValue = {
  simulation: null,
  state: "NotRun",
  error: null,
  errorItemId: null,
  parameterValues: {},
  initialMarking: new Map(),
  currentViewedFrame: null,
  dt: 0.01,
  setInitialMarking: () => {},
  setParameterValue: () => {},
  setDt: () => {},
  initializeParameterValuesFromDefaults: () => {},
  initialize: () => {},
  run: () => {},
  pause: () => {},
  reset: () => {},
  setCurrentViewedFrame: () => {},
};

export const SimulationContext = createContext<SimulationContextValue>(
  DEFAULT_CONTEXT_VALUE,
);
