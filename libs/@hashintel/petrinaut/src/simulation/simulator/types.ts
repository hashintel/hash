/**
 * Internal types for the simulation engine.
 *
 * These types are used by the simulator and worker modules but are not
 * part of the public SimulationContext API.
 */

import type { Color, Place, SDCPN, Transition } from "../../core/types/sdcpn";
import type { RuntimeDistribution } from "./distribution";
import type { SimulationFrame } from "../context";

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
) => Record<string, Record<string, number | RuntimeDistribution>[]>;

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
  /** Maximum simulation time (immutable once set). Null means no limit. */
  maxTime: number | null;
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
  /** Maximum simulation time (immutable). Null means no limit. */
  maxTime: number | null;
  /** Current state of the seeded random number generator */
  rngState: number;
  /** History of all computed frames */
  frames: SimulationFrame[];
  /** Index of the current frame in the frames array */
  currentFrameNumber: number;
};

// Re-export frame types from context for convenient access within simulator
export type {
  SimulationFrame,
  SimulationFrameState_Place,
  SimulationFrameState_Transition,
} from "../context";
