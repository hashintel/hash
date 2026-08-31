import { SDCPNItemError } from "../../errors";
import {
  executeBufferKernel,
  fillPlaceBases,
  fillTokenIndices,
} from "../engine/buffer-transition";
import { hasCapacityHeadroom } from "../engine/capacity";
import { enumerateWeightedMarkingIndicesGenerator } from "../engine/enumerate-weighted-markings";
import { nextRandom } from "../engine/seeded-rng";
import { getPlaceIndex } from "./layout";

import type { CompiledTransition } from "../engine/types";
import type { MonteCarloFrameBuffer } from "./frame-buffer";
import type {
  MonteCarloRunState,
  PlaceID,
  TransitionEffect,
} from "./internal-types";

/**
 * Computes the effect of one transition against a candidate frame.
 *
 * The function checks structural enablement, samples the transition firing
 * probability from the run RNG state, evaluates user-authored lambda/kernel
 * functions, samples distribution-valued outputs, and returns the token
 * removals/additions that the caller should apply to the frame.
 */
export function computeTransitionEffect(
  run: MonteCarloRunState,
  frame: MonteCarloFrameBuffer,
  transition: CompiledTransition,
  /**
   * Tokens produced by earlier transitions in this same frame, not yet written
   * into the frame's counts. Required for capacity checks: without it, several
   * transitions feeding one bounded place could each fit and jointly overflow.
   */
  pendingOutputCounts: Uint32Array | null,
): { firing: TransitionEffect | null; newRngState: number } {
  const { frameLayout } = run.simulation;

  const inputPlaces = transition.inputPlaces.map((inputPlace) => {
    const placeIndex = getPlaceIndex(frameLayout, inputPlace.placeId);

    return {
      ...inputPlace,
      placeIndex,
      count: frame.placeCounts[placeIndex] ?? 0,
      byteOffset: frame.placeOffsets[placeIndex] ?? 0,
      strideBytes: frameLayout.placeStrideBytes[placeIndex] ?? 0,
    };
  });

  const enabled = inputPlaces.every((inputPlace) =>
    inputPlace.arcType === "inhibitor"
      ? inputPlace.count < inputPlace.weight
      : inputPlace.count >= inputPlace.weight,
  );
  // A disabled transition consumes no randomness.
  if (!enabled) {
    return { firing: null, newRngState: run.rngState };
  }

  // A full output place blocks its producers, mirroring an input arc that
  // cannot be satisfied, so it consumes no randomness either.
  if (
    transition.capacityConstraints.length > 0 &&
    !hasCapacityHeadroom(
      transition.capacityConstraints,
      frame.placeCounts,
      pendingOutputCounts,
    )
  ) {
    return { firing: null, newRngState: run.rngState };
  }

  // One uniform draw per evaluated enabled transition, fired or not.
  const [u1, candidateRngState] = nextRandom(run.rngState);
  const inputPlacesWithValues = inputPlaces.filter(
    (place) => place.strideBytes > 0 && place.arcType !== "inhibitor",
  );
  const standardInputPlacesWithoutValues = inputPlaces.filter(
    (place) => place.strideBytes === 0 && place.arcType === "standard",
  );

  const tokenCombinations = enumerateWeightedMarkingIndicesGenerator(
    inputPlacesWithValues,
  );

  // The compiled buffer-ABI lambda/kernel read token attributes at
  // packed-struct byte offsets straight from the frame's shared views (see
  // compute-possible-transition.ts). Place bases don't change per combination.
  if (!fillPlaceBases(transition.placeBases, inputPlacesWithValues)) {
    throw new SDCPNItemError(
      `The compiled program for transition \`${transition.name}\` does not match the net (input arc count changed). Recompile the artifacts from the current net.`,
      transition.id,
    );
  }

  for (const tokenCombinationIndices of tokenCombinations) {
    if (!fillTokenIndices(transition.indices, tokenCombinationIndices)) {
      throw new SDCPNItemError(
        `The compiled program for transition \`${transition.name}\` does not match the net (input token slot count changed). Recompile the artifacts from the current net.`,
        transition.id,
      );
    }

    let lambdaResult: ReturnType<typeof transition.lambdaFn>;
    try {
      lambdaResult = transition.lambdaFn(
        frame.tokenViews.f64,
        frame.tokenViews.u64,
        frame.tokenViews.u8,
        transition.placeBases,
        transition.indices,
      );
    } catch (error) {
      throw new SDCPNItemError(
        `Error while executing lambda function for transition \`${
          transition.name
        }\`:\n\n${(error as Error).message}`,
        transition.id,
      );
    }

    const lambdaNumeric =
      typeof lambdaResult === "boolean"
        ? lambdaResult
          ? Number.POSITIVE_INFINITY
          : 0
        : lambdaResult;
    // Memoryless per-frame firing probability 1 - e^(-lambda * dt), matching
    // the interactive engine (see compute-possible-transition.ts).
    if (Math.exp(-lambdaNumeric * run.simulation.dt) > u1) {
      continue;
    }

    // The compiled kernel writes output tokens into the transition's staging
    // bytes; Distribution/uuid values are resolved through the kernel sink,
    // advancing the RNG state.
    let add: Record<PlaceID, Uint8Array[]>;
    let currentRngState = candidateRngState;

    if (transition.kernelFn === null) {
      // No colored output places — every output gets `weight` empty blocks.
      add = {};
      for (const outputPlace of transition.outputPlaces) {
        add[outputPlace.placeId] = Array.from(
          { length: outputPlace.weight },
          () => new Uint8Array(0),
        );
      }
    } else {
      try {
        const { add: kernelAdd, newRngState: rngAfterKernel } =
          executeBufferKernel({
            transition,
            views: frame.tokenViews,
            rngState: candidateRngState,
          });
        add = kernelAdd;
        currentRngState = rngAfterKernel;
      } catch (error) {
        throw error instanceof SDCPNItemError
          ? error
          : new SDCPNItemError(
              `Error while executing transition kernel for transition \`${
                transition.name
              }\`:\n\n${(error as Error).message}`,
              transition.id,
            );
      }
    }

    const remove: TransitionEffect["remove"] = {};
    for (const inputPlace of standardInputPlacesWithoutValues) {
      remove[inputPlace.placeId] = inputPlace.weight;
    }
    for (const [index, tokenIndices] of tokenCombinationIndices.entries()) {
      const inputPlace = inputPlacesWithValues[index]!;
      if (inputPlace.arcType === "standard") {
        remove[inputPlace.placeId] = new Set(tokenIndices);
      }
    }

    return {
      firing: { remove, add },
      newRngState: currentRngState,
    };
  }

  // Enabled but not firing this frame; the draw is still consumed.
  return { firing: null, newRngState: candidateRngState };
}
