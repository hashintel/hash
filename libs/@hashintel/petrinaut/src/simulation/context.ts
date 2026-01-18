import { createContext } from "react";

import type { SimulationInstance } from "./simulator/types";

export type SimulationState =
  | "NotRun"
  | "Running"
  | "Complete"
  | "Error"
  | "Paused";

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
    [transitionId: string]:
      | {
          /** Time since last firing of the transition at the time of the frame. */
          timeSinceLastFiring: number;
        }
      | undefined;
  };
};

/**
 * Difference between two simulation frame states.
 */
export type SimulationFrameStateDiff = {
  currentFrame: SimulationFrameState;
  comparedFrame: SimulationFrameState;
  places: {
    [placeId: string]:
      | {
          tokenCount: number;
        }
      | undefined;
  };
  transitions: {
    [transitionId: string]:
      | {
          /** Number of times this transition fired since the compared frame. */
          firingCount: number;
        }
      | undefined;
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
  /**
   * The difference between the currently viewed frame and the previous frame.
   * Null when no simulation is running, no frames exist, or viewing frame 0.
   */
  currentViewedFrameDiff: SimulationFrameStateDiff | null;
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
  currentViewedFrameDiff: null,
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
