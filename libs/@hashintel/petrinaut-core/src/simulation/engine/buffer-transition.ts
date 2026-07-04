/**
 * Shared buffer-ABI transition execution used by both the single-run engine
 * (`compute-possible-transition.ts`) and the Monte Carlo path
 * (`monte-carlo/transition-effect.ts`).
 *
 * Buffer-ABI lambdas/kernels read token attributes at statically-resolved
 * offsets from the frame's packed token floats — no per-combination record
 * decoding and no object allocation. The per-transition scratch buffers
 * (`slotBases`, `kernelStaging`, pending-distribution arrays) live on the
 * `CompiledTransition` and are reused across evaluations; the engine is
 * single-threaded per simulation instance.
 */
import { sampleDistribution } from "./sample-distribution";

import type { RuntimeDistribution } from "../authoring/user-code/distribution";
import type { CompiledTransition, CompiledTransitionBuffer } from "./types";

/**
 * Fills `slotBases` with the float base offset of each selected token, in
 * slot order (per colored non-inhibitor input arc, `weight` slots each —
 * matching the emitter's layout, see `hir/surface-context.ts`).
 *
 * Returns `false` when the combination does not match the expected slot
 * count (stale artifact) — callers must fall back to the object path.
 */
export function fillSlotBases(
  slotBases: Int32Array,
  combinationIndices: readonly (readonly number[])[],
  places: readonly { offset: number; dimensions: number }[],
): boolean {
  let slot = 0;
  for (const [placeIndex, tokenIndices] of combinationIndices.entries()) {
    const place = places[placeIndex]!;
    for (const tokenIndex of tokenIndices) {
      if (slot >= slotBases.length) {
        return false;
      }
      // eslint-disable-next-line no-param-reassign -- writes into the reusable scratch buffer
      slotBases[slot] = place.offset + tokenIndex * place.dimensions;
      slot += 1;
    }
  }
  return slot === slotBases.length;
}

/**
 * Runs a buffer-ABI kernel: fills the staging floats, then samples deferred
 * distribution values ordered by output float index — reproducing the legacy
 * (place, token, element) sampling order, and therefore the exact RNG
 * stream. Shared distribution objects keep one draw via their sample cache.
 *
 * Returns the advanced RNG state; the staging buffer holds the final values.
 */
export function executeBufferKernel(
  buffer: CompiledTransitionBuffer,
  kernelFn: NonNullable<CompiledTransitionBuffer["kernelFn"]>,
  tokenValues: Float64Array,
  rngState: number,
): number {
  const { kernelStaging, pendingSlots, pendingDists } = buffer;
  pendingSlots.length = 0;
  pendingDists.length = 0;

  kernelFn(tokenValues, buffer.slotBases, kernelStaging, (index, dist) => {
    pendingSlots.push(index);
    pendingDists.push(dist);
  });

  if (pendingSlots.length === 0) {
    return rngState;
  }

  // Sample ordered by output float index (kernels emit sinks in evaluation
  // order, which may differ from element order within a token).
  const order = pendingSlots.map((_, index) => index);
  order.sort((left, right) => pendingSlots[left]! - pendingSlots[right]!);

  let currentRngState = rngState;
  for (const pendingIndex of order) {
    const dist: RuntimeDistribution = pendingDists[pendingIndex]!;
    const [sampled, nextRngState] = sampleDistribution(dist, currentRngState);
    currentRngState = nextRngState;
    kernelStaging[pendingSlots[pendingIndex]!] = sampled;
  }
  // Clear per-call sample caches so the next firing draws fresh values:
  // emitted kernels construct fresh distribution objects per call, so this
  // is defensive only.
  pendingSlots.length = 0;
  pendingDists.length = 0;

  return currentRngState;
}

/**
 * Converts the kernel staging floats into per-place token value arrays
 * (place-major, colored output arcs in arc order; uncolored outputs get
 * empty tuples). Later arcs to the same place overwrite earlier ones,
 * matching the legacy object semantics where one kernel result array served
 * every arc to that place.
 */
export function stagingToAddMap(
  transition: CompiledTransition,
  staging: Float64Array,
): Record<string, number[][]> {
  const addMap: Record<string, number[][]> = {};
  let floatBase = 0;

  for (const outputPlace of transition.outputPlaces) {
    if (!outputPlace.elements) {
      addMap[outputPlace.placeId] = Array.from(
        { length: outputPlace.weight },
        () => [],
      );
      continue;
    }
    const dimensions = outputPlace.elements.length;
    const tokenArrays: number[][] = [];
    for (let tokenIndex = 0; tokenIndex < outputPlace.weight; tokenIndex += 1) {
      const start = floatBase + tokenIndex * dimensions;
      const values: number[] = [];
      for (let dimension = 0; dimension < dimensions; dimension += 1) {
        values.push(staging[start + dimension]!);
      }
      tokenArrays.push(values);
    }
    addMap[outputPlace.placeId] = tokenArrays;
    floatBase += outputPlace.weight * dimensions;
  }

  return addMap;
}
