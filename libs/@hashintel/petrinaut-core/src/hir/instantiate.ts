/**
 * Instantiation of HIR-emitted JavaScript programs.
 *
 * Deliberately free of any compiler dependency (no `typescript` import): the
 * simulation workers instantiate precompiled artifact sources without
 * bundling the TS→HIR frontend. Compilation lives in `compile.ts`; sources
 * are emitted by `emit-buffer-js.ts` (the simulator's only program shape —
 * packed-struct buffer access with compile-time-constant offsets/strides).
 */
import type { RuntimeDistribution } from "../simulation/authoring/user-code/distribution";

export type HirParameterValues = Record<string, number | boolean>;

/** Per-run string pool view needed by compiled programs. Structural subset
 * of the engine's `StringPool`. */
export type HirStringPool = {
  get(id: number): string;
  intern(value: string): number;
};

/** Read-only pool view — all metric programs need (they never intern). */
export type HirStringPoolReader = Pick<HirStringPool, "get">;

/**
 * Deferred kernel-output slots that consume the seeded RNG or need engine
 * conversion. Emitted calls arrive in (arc, token, element-declaration)
 * order — process them in call order to reproduce the RNG stream.
 * `index` is a 64-bit lane index into the staging buffer.
 */
export type HirKernelSink = (
  kind: "dist" | "generate" | "from",
  index: number,
  payload: unknown,
) => void;

/** Buffer-native dynamics (token format v2: one place's packed token bytes).
 * Parameters and the string pool are pre-bound. */
export type HirCompiledBufferDynamics = (
  placeBytes: Uint8Array,
  numberOfTokens: number,
) => Float64Array;

/**
 * Buffer-ABI lambda: reads token attributes at compile-time-constant byte
 * offsets through the frame's shared views. `placeBases[arc]` is each input
 * arc's place base byte offset; `indices[slot]` the selected token index per
 * slot (strides are baked into the program). Parameters/pool pre-bound.
 */
export type HirCompiledBufferLambda = (
  f64: Float64Array,
  u64: BigUint64Array,
  u8: Uint8Array,
  placeBases: Int32Array,
  indices: Int32Array,
) => number | boolean;

/**
 * Buffer-ABI metric: reads a frame's packed token region through shared
 * views plus its dense per-place `placeCounts`/`placeOffsets` arrays and
 * returns one number. The place-ordinal→frame-place-index table and string
 * pool are pre-bound at instantiation.
 */
export type HirCompiledMetric = (
  f64: Float64Array,
  u64: BigUint64Array,
  u8: Uint8Array,
  placeCounts: Uint32Array,
  placeOffsets: Uint32Array,
) => number;

/** Buffer-ABI kernel: writes output attributes into per-transition staging
 * (place-major, baked offsets); RNG-consuming slots defer through the sink. */
export type HirCompiledBufferKernel = (
  f64: Float64Array,
  u64: BigUint64Array,
  u8: Uint8Array,
  placeBases: Int32Array,
  indices: Int32Array,
  outF64: Float64Array,
  outU64: BigUint64Array,
  outU8: Uint8Array,
  sink: HirKernelSink,
) => void;

export type HirLambdaArtifact = {
  source: string;
  /** Expected `indices.length` — engine-side sanity check. */
  inputSlotCount: number;
};

export type HirKernelArtifact = {
  source: string;
  inputSlotCount: number;
  /** Expected staging byte length — engine-side sanity check. */
  outputByteCount: number;
};

export type HirDynamicsArtifact = {
  source: string;
};

export type HirMetricArtifact = {
  source: string;
  /** Places referenced by the program, in `__places` ordinal order. */
  placeNames: string[];
};

/**
 * Precompiled HIR programs for one SDCPN, keyed by item id (differential
 * equation id / transition id / metric id, pre-flattening — the engine
 * resolves flattened `path::id` ids back to their source id). Produced by
 * `compileHirArtifacts`; the engine has no other compilation path.
 */
export type HirArtifacts = {
  version: 4;
  /** Hash of the sanitized SDCPN + extensions used during compilation. */
  fingerprint: string;
  dynamics: Record<string, HirDynamicsArtifact>;
  lambdas: Record<string, HirLambdaArtifact>;
  kernels: Record<string, HirKernelArtifact>;
  metrics: Record<string, HirMetricArtifact>;
};

/**
 * Distribution constructors injected into emitted code as `__dist`.
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

function instantiate(
  source: string,
  parameterValues: HirParameterValues,
  stringPool: HirStringPool,
): unknown {
  // eslint-disable-next-line no-new-func, @typescript-eslint/no-implied-eval, @typescript-eslint/no-unsafe-call
  return new Function(
    "__dist",
    "__params",
    "__pool",
    `"use strict"; return (${source});`,
  )(hirDistributionRuntime, parameterValues, stringPool);
}

export function instantiateHirBufferDynamics(
  source: string,
  parameterValues: HirParameterValues,
  stringPool: HirStringPool,
): HirCompiledBufferDynamics {
  return instantiate(
    source,
    parameterValues,
    stringPool,
  ) as HirCompiledBufferDynamics;
}

export function instantiateHirBufferLambda(
  source: string,
  parameterValues: HirParameterValues,
  stringPool: HirStringPool,
): HirCompiledBufferLambda {
  return instantiate(
    source,
    parameterValues,
    stringPool,
  ) as HirCompiledBufferLambda;
}

export function instantiateHirBufferKernel(
  source: string,
  parameterValues: HirParameterValues,
  stringPool: HirStringPool,
): HirCompiledBufferKernel {
  return instantiate(
    source,
    parameterValues,
    stringPool,
  ) as HirCompiledBufferKernel;
}

/**
 * Instantiates a compiled metric program. `placeIndices[ordinal]` maps each
 * of the artifact's `placeNames` to the frame's place index (resolve once
 * per experiment/simulation, not per frame). `parameterValues` binds the
 * ambient net `parameters.<name>` reads to the run's resolved values (the
 * same values the engine binds for dynamics/lambdas/kernels); pass `{}` when
 * the parameters extension is disabled. Metrics never intern strings, so the
 * pool is read-only; `__dist` is bound for ABI parity but unused.
 */
export function instantiateHirMetric(
  source: string,
  parameterValues: HirParameterValues,
  placeIndices: Int32Array,
  stringPool: HirStringPoolReader,
): HirCompiledMetric {
  // eslint-disable-next-line no-new-func, @typescript-eslint/no-implied-eval, @typescript-eslint/no-unsafe-call
  return new Function(
    "__dist",
    "__params",
    "__pool",
    "__places",
    `"use strict"; return (${source});`,
  )(
    hirDistributionRuntime,
    parameterValues,
    stringPool,
    placeIndices,
  ) as HirCompiledMetric;
}
