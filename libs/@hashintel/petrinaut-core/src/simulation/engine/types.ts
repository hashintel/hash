/**
 * Internal types for the simulation engine.
 *
 * These types are used by the simulator and worker modules but are not
 * part of the public simulation API.
 */

import type { PetrinautExtensionSettings } from "../../extensions";
import type {
  Color,
  InputArcType,
  Place,
  SDCPN,
  TokenAttributeValue,
  TokenRecord,
  Transition,
} from "../../types/sdcpn";
import type { InitialMarking } from "../api";
import type { RuntimeDistribution } from "../authoring/user-code/distribution";
import type { EngineFrame, EngineFrameLayout } from "../frames/internal-frame";
import type { TokenSlotLayout } from "./token-layout";

/**
 * Runtime parameter values used during simulation execution.
 * Maps parameter names to their resolved numeric or boolean values.
 */
export type ParameterValues = Record<string, number | boolean>;

/**
 * Engine-facing differential equation for one place's continuous dynamics.
 *
 * Today this wraps the user-authored object API and adapts it to/from the
 * engine's packed token byte regions. Later this can be replaced by an
 * IR-compiled buffer-native function without changing the stepping loop.
 *
 * `placeBytes` is one place's token byte region (`numberOfTokens ×
 * strideBytes`, 8-aligned). The returned derivatives are laid out as
 * `numberOfTokens × realFieldF64Offsets.length`, in the field order of the
 * place colour's `TokenSlotLayout.realFieldF64Offsets`.
 */
export type DifferentialEquationFn = (
  placeBytes: Uint8Array,
  numberOfTokens: number,
) => Float64Array;

export type TransitionTokenValues = Record<string, TokenRecord[]>;
export type TransitionKernelOutput = Record<
  string,
  Record<string, TokenAttributeValue | RuntimeDistribution>[]
>;

/**
 * Engine-facing lambda function for transition firing probability.
 *
 * Runtime parameter values are already bound by `buildSimulation`.
 *
 * Returns a rate (number) for stochastic transitions or a boolean for predicate transitions.
 */
export type LambdaFn = (tokenValues: TransitionTokenValues) => number | boolean;

/**
 * Engine-facing transition kernel function for token generation.
 *
 * Runtime parameter values are already bound by `buildSimulation`.
 *
 * Computes the output tokens to create when a transition fires.
 */
export type TransitionKernelFn = (
  tokenValues: TransitionTokenValues,
) => TransitionKernelOutput;

export type CompiledTransitionPlace = {
  placeId: string;
  placeName: string;
  weight: number;
  /** Colour elements in declaration order, or null for uncoloured places. */
  elements: readonly Color["elements"][number][] | null;
  /** Packed token layout for the place colour, or null for uncoloured places. */
  tokenLayout: TokenSlotLayout | null;
};

export type CompiledTransitionInputPlace = CompiledTransitionPlace & {
  arcType: InputArcType;
};

export type CompiledTransition = {
  id: string;
  name: string;
  inputPlaces: readonly CompiledTransitionInputPlace[];
  outputPlaces: readonly CompiledTransitionPlace[];
  lambdaFn: LambdaFn;
  transitionKernelFn: TransitionKernelFn;
};

/**
 * Input configuration for building a new simulation instance.
 */
export type SimulationInput = {
  /** The SDCPN definition to simulate */
  sdcpn: SDCPN;
  /** Enabled SDCPN extensions for this simulation run. */
  extensions?: PetrinautExtensionSettings;
  /** Initial token distribution across places */
  initialMarking: InitialMarking;
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
  /** Transition definitions specialized for runtime execution. */
  compiledTransitions: Map<string, CompiledTransition>;
  /** Resolved parameter values for this simulation run */
  parameterValues: ParameterValues;
  /** Time step for simulation advancement */
  dt: number;
  /** Maximum simulation time (immutable). Null means no limit. */
  maxTime: number | null;
  /** Simulation time for the current frame, owned by the run controller. */
  currentTime: number;
  /** Current state of the seeded random number generator */
  rngState: number;
  /** SDCPN-specialized binary frame layout for this simulation run. */
  frameLayout: EngineFrameLayout;
  /** History of all computed frames */
  frames: EngineFrame[];
  /** Index of the current frame in the frames array */
  currentFrameNumber: number;
};

// Re-export frame types for convenient access within simulator internals.
export type {
  EngineFrame,
  EngineFrameLayout,
  EngineFramePlaceState,
  EngineFrameSnapshot,
} from "../frames/internal-frame";
