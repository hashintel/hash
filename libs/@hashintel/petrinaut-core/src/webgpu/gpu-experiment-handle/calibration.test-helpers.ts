/**
 * Test builders for the GPU handle's calibration sessions: shaders whose
 * only relevant facts are their size and derived places, profiles with one
 * derived-capacity place per slab, and runner outcomes. Not shipped — only
 * imported from `*.test.ts` files.
 */
import type { CompiledNetShader } from "../compile-net-shader";
import type { GpuNetProfile } from "../eligibility";
import type { GpuExperimentResult } from "../runner";
import type { CalibrationSession } from "./calibration";

/** A shader whose only relevant facts are its size and its derived places. */
export const shaderAt = (
  capacities: ReadonlyMap<string, number>,
  { metricIds = ["m0"] }: { metricIds?: string[] } = {},
): CompiledNetShader => {
  const slabWords = [...capacities.values()].reduce(
    (sum, capacity) => sum + capacity * 2,
    0,
  );
  return {
    wgsl: "",
    stateWordsPerRun: 4 + slabWords,
    summaryWordsPerRun: 2 + capacities.size,
    placeCountOffsets: [0],
    placeTokenOffsets: [4],
    placeTokenStrides: [2],
    summaryStatusOffset: 1,
    rngOffset: 2,
    statusOffset: 3,
    derivedCapacityPlaceIndices: [...capacities.keys()].map(
      (_, index) => index,
    ),
    metricIds,
    histogramBins: 64,
    runParameterIds: [],
    compiledLambdas: [],
  };
};

/** A derived-capacity place per slab, in slab order. */
export const placeAt = (
  [id, capacity]: [string, number],
  { pairConsumed = false }: { pairConsumed?: boolean } = {},
): GpuNetProfile["places"][number] => ({
  id,
  name: id.toUpperCase(),
  capacity,
  capacitySource: "derived",
  declaredCapacity: 0xffffffff,
  realFields: ["x", "y"],
  discreteFields: [],
  colored: true,
  pairConsumed,
});

/** A session over a derived-capacity place per slab, recompiling at any size. */
export const session = (
  capacities: Record<string, number>,
  { pairConsumed = false }: { pairConsumed?: boolean } = {},
): CalibrationSession => {
  const initial = new Map(Object.entries(capacities));
  return {
    backend: {
      recompile: (next) => ({ ok: true, shader: shaderAt(next) }),
      profile: {
        places: [...initial].map((entry) => placeAt(entry, { pairConsumed })),
        uncolouredOnly: false,
        bytesPerRun: 16,
      },
    },
    shader: shaderAt(initial),
    capacities: initial,
  };
};

/** A finished runner result with nothing observed, overridable per test. */
export const outcome = (
  overrides: Partial<GpuExperimentResult> = {},
): GpuExperimentResult => ({
  cancelled: false,
  frames: [],
  finalPlaceCounts: new Uint32Array(0),
  deadlockedRuns: 0,
  completedRuns: 0,
  overflowRuns: 0,
  derivedPlaceMaxes: [],
  dispatchMs: 0,
  metricRanges: [],
  metricErrors: [],
  ...overrides,
});
