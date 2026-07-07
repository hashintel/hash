/**
 * Internal types for the simulation engine.
 *
 * These types are used by the simulator and worker modules but are not
 * part of the public simulation API.
 */

import type { PetrinautExtensionSettings } from "../../extensions";
import type {
  HirArtifacts,
  HirCompiledBufferKernel,
  HirCompiledBufferLambda,
} from "../../hir-runtime";
import type {
  Color,
  InputArcType,
  Place,
  SDCPN,
  Transition,
} from "../../types/sdcpn";
import type { InitialMarking } from "../api";
import type { EngineFrame, EngineFrameLayout } from "../frames/internal-frame";
import type { StringPool } from "./string-pool";
import type { TokenRegionViews, TokenSlotLayout } from "./token-layout";

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

/**
 * One transition, compiled to buffer-ABI HIR programs plus reusable scratch.
 * The scratch arrays are shared across evaluations — the engine is
 * single-threaded per simulation instance.
 */
export type CompiledTransition = {
  id: string;
  name: string;
  inputPlaces: readonly CompiledTransitionInputPlace[];
  outputPlaces: readonly CompiledTransitionPlace[];
  /** Buffer-ABI lambda `(f64, u64, u8, placeBases, indices) => number |
   * boolean` (token format v2 packed structs); parameters/pool pre-bound. */
  lambdaFn: HirCompiledBufferLambda;
  /** Buffer-ABI kernel writing into `kernelStaging`, or null when the
   * transition has no colored output places. */
  kernelFn: HirCompiledBufferKernel | null;
  /** Reusable scratch (single-threaded per instance): one base BYTE offset
   * per colored non-inhibitor input arc, in arc order. */
  placeBases: Int32Array;
  /** Reusable scratch: one selected token index per input token slot (sum of
   * those arcs' weights — see `hir/surface-context.ts` slot layout). */
  indices: Int32Array;
  /** Reusable kernel output staging: colored output arcs place-major, tokens
   * back-to-back (`strideBytes` each). */
  kernelStaging: Uint8Array;
  /** f64/u64/u8 views over `kernelStaging` (see `createTokenRegionViews`). */
  kernelStagingViews: TokenRegionViews;
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
  /**
   * Optional precompiled HIR artifacts (see `compileHirArtifacts`). When an
   * item has an artifact it is instantiated directly. Items with required user
   * code and no artifact fail to build. Artifacts must be produced from the
   * same SDCPN snapshot.
   */
  hirArtifacts?: HirArtifacts;
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
  /**
   * Per-run intern pool for `string` token elements. Owned by the simulation
   * (fresh per init/run), append-only while the run advances — frames store
   * u64 pool references, never the strings themselves.
   */
  stringPool: StringPool;
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
