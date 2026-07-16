/**
 * Shared buffer-ABI transition execution helpers used by both the single-run
 * engine (`compute-possible-transition.ts`) and the Monte Carlo path
 * (`monte-carlo/transition-effect.ts`).
 *
 * Buffer-ABI lambdas/kernels read token attributes at statically-resolved
 * byte offsets from the frame's packed token structs (token format v2) — no
 * per-combination record decoding. The per-transition `placeBases`/`indices`/
 * `kernelStaging` scratch lives on the `CompiledTransition` and is reused
 * across evaluations; the engine is single-threaded per simulation instance.
 */
import { sampleDistribution } from "./sample-distribution";
import { generateUuidFromRng, toUuid } from "./uuid";

import type { HirKernelSink } from "../../hir-runtime";
import type { RuntimeDistribution } from "../authoring/user-code/distribution";
import type { TokenRegionViews } from "./token-layout";
import type { CompiledTransition } from "./types";

const UUID_LO_MASK = 0xffffffffffffffffn;

/**
 * Fills `placeBases` with each colored non-inhibitor input arc's place base
 * BYTE offset within the token region, in arc order — matching the emitter's
 * `placeBases[arc]` indexing (see `hir/surface-context.ts`).
 *
 * Runs once per transition evaluation (the bases don't change across
 * combinations). Returns `false` when the arc count does not match the
 * compiled program's expectation (stale compiled program) — callers must
 * throw an `SDCPNItemError`.
 */
export function fillPlaceBases(
  placeBases: Int32Array,
  places: readonly { byteOffset: number }[],
): boolean {
  if (places.length !== placeBases.length) {
    return false;
  }
  for (const [arcIndex, place] of places.entries()) {
    // eslint-disable-next-line no-param-reassign -- writes into the reusable scratch buffer
    placeBases[arcIndex] = place.byteOffset;
  }
  return true;
}

/**
 * Flattens one enumerated combination's selected token indices into the
 * reusable `indices` array, in slot order (per colored non-inhibitor input
 * arc, `weight` slots each). Returns `false` on slot-count mismatch (stale
 * compiled program) — callers must throw an `SDCPNItemError`.
 */
export function fillTokenIndices(
  indices: Int32Array,
  combinationIndices: readonly (readonly number[])[],
): boolean {
  let slot = 0;
  for (const tokenIndices of combinationIndices) {
    for (const tokenIndex of tokenIndices) {
      if (slot >= indices.length) {
        return false;
      }
      // eslint-disable-next-line no-param-reassign -- writes into the reusable scratch buffer
      indices[slot] = tokenIndex;
      slot += 1;
    }
  }
  return slot === indices.length;
}

/**
 * Runs a transition's buffer-ABI kernel and materializes its output tokens.
 *
 * The kernel writes attribute values into the transition's reusable
 * `kernelStaging` bytes (colored output arcs place-major, tokens
 * back-to-back). RNG-consuming values — distributions, generated/converted
 * UUIDs — arrive through the sink in emitted call order, which the engine
 * processes immediately so the RNG stream is reproduced deterministically
 * per seed.
 *
 * Afterwards the staging bytes are sliced into per-token `Uint8Array` blocks
 * keyed by place ID (later arcs to the same place overwrite earlier ones,
 * matching the object-convention semantics); uncolored output places get
 * `weight` empty blocks.
 */
export function executeBufferKernel(args: {
  transition: CompiledTransition;
  /** Views over the frame's token byte region. */
  views: TokenRegionViews;
  rngState: number;
}): { add: Record<string, Uint8Array[]>; newRngState: number } {
  const { transition, views, rngState } = args;
  const kernelFn = transition.kernelFn;
  if (kernelFn === null) {
    throw new Error(
      `Transition ${transition.id} has no compiled kernel program`,
    );
  }

  const { kernelStaging, kernelStagingViews } = transition;
  // Fresh padding bytes per firing, matching the object path's per-token
  // zeroed buffers (attribute lanes are fully overwritten by the kernel).
  kernelStaging.fill(0);

  let rng = rngState;
  const sink: HirKernelSink = (kind, index, payload) => {
    /* eslint-disable no-bitwise -- uuid lane splitting */
    if (kind === "dist") {
      const [value, nextRng] = sampleDistribution(
        payload as RuntimeDistribution,
        rng,
      );
      rng = nextRng;
      kernelStagingViews.f64[index] = value;
    } else if (kind === "generate") {
      const [uuid, nextRng] = generateUuidFromRng(rng);
      rng = nextRng;
      kernelStagingViews.u64[index] = uuid & UUID_LO_MASK;
      kernelStagingViews.u64[index + 1] = uuid >> 64n;
    } else {
      const uuid = toUuid(payload);
      kernelStagingViews.u64[index] = uuid & UUID_LO_MASK;
      kernelStagingViews.u64[index + 1] = uuid >> 64n;
    }
    /* eslint-enable no-bitwise */
  };

  kernelFn(
    views.f64,
    views.u64,
    views.u8,
    transition.placeBases,
    transition.indices,
    kernelStagingViews.f64,
    kernelStagingViews.u64,
    kernelStagingViews.u8,
    sink,
  );

  const add: Record<string, Uint8Array[]> = {};
  let stagingOffset = 0;
  for (const outputPlace of transition.outputPlaces) {
    if (outputPlace.tokenLayout === null) {
      add[outputPlace.placeId] = Array.from(
        { length: outputPlace.weight },
        () => new Uint8Array(0),
      );
      continue;
    }
    const { strideBytes } = outputPlace.tokenLayout;
    const tokenBlocks: Uint8Array[] = [];
    for (let tokenIndex = 0; tokenIndex < outputPlace.weight; tokenIndex++) {
      tokenBlocks.push(
        kernelStaging.slice(stagingOffset, stagingOffset + strideBytes),
      );
      stagingOffset += strideBytes;
    }
    add[outputPlace.placeId] = tokenBlocks;
  }

  return { add, newRngState: rng };
}
