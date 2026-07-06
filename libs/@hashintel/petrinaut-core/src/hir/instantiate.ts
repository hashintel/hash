/**
 * Instantiation of HIR-emitted JavaScript sources.
 *
 * Deliberately free of any compiler dependency (no `typescript` import): the
 * simulation engine and its workers instantiate precompiled artifact strings
 * without bundling the TS→HIR frontend. Compilation lives in `compile.ts`;
 * artifact sources are emitted by `emit-js.ts` (object convention) and
 * `emit-buffer-js.ts` (buffer ABI).
 */
import type { RuntimeDistribution } from "../simulation/authoring/user-code/distribution";

export type HirParameterValues = Record<string, number | boolean>;
type TokensByPlace = Record<string, Record<string, number | boolean>[]>;

/** Legacy object-convention user function (fallback path). */
export type HirCompiledUserFn = (
  tokensByPlace: TokensByPlace,
  parameters: HirParameterValues,
) => unknown;

/** Per-run string pool view needed by compiled programs (resolving interned
 * string attributes). Structural subset of the engine's `StringPool`. */
export type HirStringPoolReader = { get(id: number): string };

/** Buffer-native dynamics (engine `DifferentialEquationFn` shape, token
 * format v2: one place's packed token bytes). Parameters and the string pool
 * are pre-bound. */
export type HirCompiledBufferDynamics = (
  placeBytes: Uint8Array,
  numberOfTokens: number,
) => Float64Array;

/**
 * Buffer-ABI lambda (token format v2): reads token attributes at
 * statically-resolved byte offsets through the frame's shared views.
 * `slotBases` holds each selected token's base byte offset within the token
 * region. Parameters and the string pool are pre-bound.
 */
export type HirCompiledBufferLambda = (
  f64: Float64Array,
  u64: BigUint64Array,
  u8: Uint8Array,
  slotBases: Int32Array,
) => number | boolean;

/**
 * Buffer-ABI kernel: writes output attributes into `out` (place-major, arc
 * order) and defers distribution-valued attributes through `distSink`.
 * Parameters are pre-bound.
 */
export type HirCompiledBufferKernel = (
  tokenValues: Float64Array,
  slotBases: Int32Array,
  out: Float64Array,
  distSink: (floatIndex: number, distribution: RuntimeDistribution) => void,
) => void;

/** A compiled program for one user-code item. `buffer` is preferred by the
 * engine; `object` is the fallback for shapes the buffer emitter cannot
 * scalarize. At least one is present for every compilable item. */
export type HirLambdaArtifact = {
  buffer?: {
    source: string;
    /** Expected `slotBases.length` — engine-side sanity check. */
    inputSlotCount: number;
  };
  object?: string;
};

export type HirKernelArtifact = {
  buffer?: {
    source: string;
    inputSlotCount: number;
    /** Expected staging size — engine-side sanity check. */
    outputFloatCount: number;
  };
  object?: string;
};

export type HirDynamicsArtifact = {
  /** Buffer-native derivative factory (see `emitBufferDynamicsJs`). */
  buffer?: string;
  /** Object-convention `(tokens, parameters) => derivatives[]` fallback. */
  object?: string;
};

/**
 * Precompiled HIR artifacts for one SDCPN, keyed by item id (differential
 * equation id / transition id, pre-flattening — the engine resolves flattened
 * `path::id` ids back to their source id). Produced by `compileHirArtifacts`.
 *
 * Artifacts must be produced from the same SDCPN snapshot that is simulated —
 * they are the only compilation path; items without an artifact fail to
 * build with a diagnosis to fix the code.
 */
export type HirArtifacts = {
  version: 2;
  dynamics: Record<string, HirDynamicsArtifact>;
  lambdas: Record<string, HirLambdaArtifact>;
  kernels: Record<string, HirKernelArtifact>;
};

/**
 * Distribution constructors injected into emitted code as `__dist`.
 * Produces the same branded objects as the previous runtime, minus the
 * `.map` method — emitted code calls `__dist.map(...)` instead.
 */
export const hirDistributionRuntime = {
  gaussian: (mean: number, deviation: number): RuntimeDistribution => ({
    __brand: "distribution",
    type: "gaussian",
    mean,
    deviation,
  }),
  uniform: (min: number, max: number): RuntimeDistribution => ({
    __brand: "distribution",
    type: "uniform",
    min,
    max,
  }),
  lognormal: (mu: number, sigma: number): RuntimeDistribution => ({
    __brand: "distribution",
    type: "lognormal",
    mu,
    sigma,
  }),
  map: (
    inner: RuntimeDistribution,
    fn: (value: number) => number,
  ): RuntimeDistribution => ({
    __brand: "distribution",
    type: "mapped",
    inner,
    fn,
  }),
};

function instantiate(source: string): unknown {
  // eslint-disable-next-line no-new-func, @typescript-eslint/no-implied-eval, @typescript-eslint/no-unsafe-call
  return new Function("__dist", `"use strict"; return (${source});`)(
    hirDistributionRuntime,
  );
}

function instantiateWithParams(
  source: string,
  parameterValues: HirParameterValues,
  stringPool?: HirStringPoolReader,
): unknown {
  // eslint-disable-next-line no-new-func, @typescript-eslint/no-implied-eval, @typescript-eslint/no-unsafe-call
  return new Function(
    "__dist",
    "__params",
    "__pool",
    `"use strict"; return (${source});`,
  )(hirDistributionRuntime, parameterValues, stringPool);
}

/** Instantiates an emitted object-convention source (`emitUserFunctionJs`). */
export function instantiateHirUserFn(source: string): HirCompiledUserFn {
  return instantiate(source) as HirCompiledUserFn;
}

/**
 * Instantiates an emitted buffer-native dynamics factory source
 * (`emitBufferDynamicsJs`), binding the run's parameter values.
 */
export function instantiateHirBufferDynamics(
  source: string,
  parameterValues: HirParameterValues,
  stringPool: HirStringPoolReader,
): HirCompiledBufferDynamics {
  return instantiateWithParams(
    source,
    parameterValues,
    stringPool,
  ) as HirCompiledBufferDynamics;
}

/** Instantiates a buffer-ABI lambda source (`emitBufferLambdaJs`), binding
 * the run's parameter values. */
export function instantiateHirBufferLambda(
  source: string,
  parameterValues: HirParameterValues,
  stringPool: HirStringPoolReader,
): HirCompiledBufferLambda {
  return instantiateWithParams(
    source,
    parameterValues,
    stringPool,
  ) as HirCompiledBufferLambda;
}

/** Instantiates a buffer-ABI kernel source (`emitBufferKernelJs`), binding
 * the run's parameter values. */
export function instantiateHirBufferKernel(
  source: string,
  parameterValues: HirParameterValues,
): HirCompiledBufferKernel {
  return instantiateWithParams(
    source,
    parameterValues,
  ) as HirCompiledBufferKernel;
}
