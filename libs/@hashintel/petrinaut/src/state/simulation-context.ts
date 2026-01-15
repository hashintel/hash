import { createContext } from "react";

import type { SimulationInstance } from "../core/types/simulation";

export type SimulationState =
  | "NotRun"
  | "Running"
  | "Complete"
  | "Error"
  | "Paused";

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
  currentlyViewedFrame: number;
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
  step: () => void;
  run: () => void;
  pause: () => void;
  reset: () => void;
  setCurrentlyViewedFrame: (frameIndex: number) => void;
};

const DEFAULT_CONTEXT_VALUE: SimulationContextValue = {
  simulation: null,
  state: "NotRun",
  error: null,
  errorItemId: null,
  parameterValues: {},
  initialMarking: new Map(),
  currentlyViewedFrame: 0,
  dt: 0.01,
  setInitialMarking: () => {},
  setParameterValue: () => {},
  setDt: () => {},
  initializeParameterValuesFromDefaults: () => {},
  initialize: () => {},
  step: () => {},
  run: () => {},
  pause: () => {},
  reset: () => {},
  setCurrentlyViewedFrame: () => {},
};

export const SimulationContext = createContext<SimulationContextValue>(
  DEFAULT_CONTEXT_VALUE,
);
