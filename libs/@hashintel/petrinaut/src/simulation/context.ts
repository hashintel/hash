import { createContext } from "react";

import type { Color, ID, Place, SDCPN, Transition } from "../core/types/sdcpn";

/**
 * Current state of the simulation lifecycle.
 */
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

//
// Simulation Instance Types
//
// These types define the internal simulation data structures. They are defined
// here to ensure the context module has no dependencies on the simulator module,
// making the context the source of truth for type definitions.
//
// TODO FE-207: This is a temporary solution that leaks implementation details of the
// SDCPN simulator (e.g., compiled function types, buffer layouts) into the
// context module. Ideally, the context should only expose a minimal public
// interface, and these internal types should live in the simulator module.
// This would require refactoring SimulationContextValue to not expose the
// full SimulationInstance, but instead provide accessor methods or a
// simplified public state type.
//

/**
 * Runtime parameter values used during simulation execution.
 * Maps parameter names to their resolved numeric or boolean values.
 */
export type ParameterValues = Record<string, number | boolean>;

/**
 * Compiled differential equation function for continuous dynamics.
 * Computes the rate of change for tokens in a place with dynamics enabled.
 */
export type DifferentialEquationFn = (
  tokens: Record<string, number>[],
  parameters: ParameterValues,
) => Record<string, number>[];

/**
 * Compiled lambda function for transition firing probability.
 * Returns a rate (number) for stochastic transitions or a boolean for predicate transitions.
 */
export type LambdaFn = (
  tokenValues: Record<string, Record<string, number>[]>,
  parameters: ParameterValues,
) => number | boolean;

/**
 * Compiled transition kernel function for token generation.
 * Computes the output tokens to create when a transition fires.
 */
export type TransitionKernelFn = (
  tokenValues: Record<string, Record<string, number>[]>,
  parameters: ParameterValues,
) => Record<string, Record<string, number>[]>;

/**
 * Input configuration for building a new simulation instance.
 */
export type SimulationInput = {
  /** The SDCPN definition to simulate */
  sdcpn: SDCPN;
  /** Initial token distribution across places */
  initialMarking: Map<string, { values: Float64Array; count: number }>;
  /** Parameter values from the simulation store (overrides SDCPN defaults) */
  parameterValues: Record<string, string>;
  /** Random seed for deterministic stochastic behavior */
  seed: number;
  /** Time step for simulation advancement */
  dt: number;
};

/**
 * A running simulation instance with compiled functions and frame history.
 * Contains all state needed to execute and advance the simulation.
 */
export type SimulationInstance = {
  /** Place definitions indexed by ID */
  places: Map<string, Place>;
  /** Transition definitions indexed by ID */
  transitions: Map<string, Transition>;
  /** Color type definitions indexed by ID */
  types: Map<string, Color>;
  /** Compiled differential equation functions indexed by place ID */
  differentialEquationFns: Map<string, DifferentialEquationFn>;
  /** Compiled lambda functions indexed by transition ID */
  lambdaFns: Map<string, LambdaFn>;
  /** Compiled transition kernel functions indexed by transition ID */
  transitionKernelFns: Map<string, TransitionKernelFn>;
  /** Resolved parameter values for this simulation run */
  parameterValues: ParameterValues;
  /** Time step for simulation advancement */
  dt: number;
  /** Current state of the seeded random number generator */
  rngState: number;
  /** History of all computed frames */
  frames: SimulationFrame[];
  /** Index of the current frame in the frames array */
  currentFrameNumber: number;
};

/**
 * A single frame (snapshot) of the simulation state at a point in time.
 * Contains the complete token distribution and transition states.
 */
export type SimulationFrame = {
  /** Back-reference to the parent simulation instance */
  simulation: SimulationInstance;
  /** Simulation time at this frame */
  time: number;
  /** Place states with token buffer offsets */
  places: Map<
    ID,
    { instance: Place; offset: number; count: number; dimensions: number }
  >;
  /** Transition states with firing information */
  transitions: Map<
    ID,
    SimulationFrameState_Transition & { instance: Transition }
  >;
  /**
   * Buffer containing all place values concatenated.
   *
   * Size: sum of (place.dimensions * place.count) for all places.
   *
   * Layout: For each place, its tokens are stored contiguously.
   *
   * Access to a place's token values can be done via the offset and count in the `places` map.
   */
  buffer: Float64Array;
};

/**
 * Simplified view of a simulation frame for UI consumption.
 * Provides easy access to place and transition states without internal details.
 */
export type SimulationFrameState = {
  /** Frame index in the simulation history */
  number: number;
  /** Simulation time at this frame */
  time: number;
  /** Place states indexed by place ID */
  places: {
    [placeId: string]:
      | {
          /** Number of tokens in the place at the time of the frame. */
          tokenCount: number;
        }
      | undefined;
  };
  /** Transition states indexed by transition ID */
  transitions: {
    [transitionId: string]: SimulationFrameState_Transition | undefined;
  };
};

/**
 * Initial token distribution for starting a simulation.
 * Maps place IDs to their initial token values and counts.
 */
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
};

const DEFAULT_CONTEXT_VALUE: SimulationContextValue = {
  simulation: null,
  state: "NotRun",
  error: null,
  errorItemId: null,
  parameterValues: {},
  initialMarking: new Map(),
  dt: 0.01,
  setInitialMarking: () => {},
  setParameterValue: () => {},
  setDt: () => {},
  initializeParameterValuesFromDefaults: () => {},
  initialize: () => {},
  run: () => {},
  pause: () => {},
  reset: () => {},
};

export const SimulationContext = createContext<SimulationContextValue>(
  DEFAULT_CONTEXT_VALUE,
);
