import { SDCPNItemError } from "../../errors";
import {
  materializeEngineFrame,
  readEngineFrame,
} from "../frames/internal-frame";
import {
  executeBufferKernel,
  fillPlaceBases,
  fillTokenIndices,
} from "./buffer-transition";
import { hasCapacityHeadroom } from "./capacity";
import { enumerateWeightedMarkingIndicesGenerator } from "./enumerate-weighted-markings";
import { nextRandom } from "./seeded-rng";
import { createTokenRegionViews } from "./token-layout";

import type { ID } from "../../types/sdcpn";
import type { EngineFrame, SimulationInstance } from "./types";

type PlaceID = ID;

const EMPTY_TOKEN_BYTES = new Uint8Array(0);

/**
 * Takes an EngineFrame, a SimulationInstance, a TransitionID, and computes the possible transition.
 *
 * Always returns the RNG state after any randomness consumed by the
 * evaluation — an enabled stochastic transition draws once whether or not it
 * fires, so the caller must thread `newRngState` forward on every call.
 * Re-testing the same draw each frame would freeze the outcome.
 *
 * `firing` is null when the transition doesn't fire; otherwise it carries:
 * - remove: Map from PlaceID to Set of token indices to remove.
 * - add: Map from PlaceID to array of packed token byte blocks to create.
 */
export function computePossibleTransition(
  frame: EngineFrame,
  simulation: SimulationInstance,
  transitionId: string,
  rngState: number,
  /**
   * Tokens earlier transitions in the same step have produced but not yet
   * written into the frame; see `executeTransitions`.
   */
  pendingOutputCounts: Uint32Array | null = null,
): {
  firing: null | {
    remove: Record<PlaceID, Set<number> | number>;
    add: Record<PlaceID, Uint8Array[]>;
  };
  newRngState: number;
} {
  const snapshot = materializeEngineFrame(simulation.frameLayout, frame);
  const transitionState = snapshot.transitions[transitionId];
  if (!transitionState) {
    throw new Error(`Transition with ID ${transitionId} not found.`);
  }

  const transition = simulation.compiledTransitions.get(transitionId);
  if (!transition) {
    throw new Error(
      `Transition definition for transition ${transitionId} not found.`,
    );
  }

  // Gather input places with their weights relative to this transition.
  const inputPlaces = transition.inputPlaces.map((inputPlace) => {
    const placeState = snapshot.places[inputPlace.placeId];
    if (!placeState) {
      throw new Error(
        `Place with ID ${inputPlace.placeId} not found in current marking.`,
      );
    }

    return {
      ...placeState,
      ...inputPlace,
    };
  });

  // Transition is enabled if standard/read arcs have enough tokens and
  // inhibitor arcs have fewer than their threshold.
  const isTransitionEnabled = inputPlaces.every((inputPlace) =>
    inputPlace.arcType === "inhibitor"
      ? inputPlace.count < inputPlace.weight
      : inputPlace.count >= inputPlace.weight,
  );

  // A disabled transition consumes no randomness.
  if (!isTransitionEnabled) {
    return { firing: null, newRngState: rngState };
  }

  // A full output place blocks its producers, mirroring an input arc that
  // cannot be satisfied. Removals are applied between transitions, so the
  // frame's counts are current, but additions land once at the end of the
  // step: `pendingOutputCounts` carries them so several transitions feeding
  // one capped place cannot collectively overflow it.
  if (
    transition.capacityConstraints.length > 0 &&
    !hasCapacityHeadroom(
      transition.capacityConstraints,
      readEngineFrame(simulation.frameLayout, frame).placeCounts,
      pendingOutputCounts,
    )
  ) {
    return { firing: null, newRngState: rngState };
  }

  //
  // Transition computation logic
  //

  // One uniform draw per evaluated enabled transition, fired or not.
  const [U1, newRngState] = nextRandom(rngState);

  // Shared views over the frame's token byte region.
  const tokenViews = createTokenRegionViews(
    snapshot.buffer.buffer,
    snapshot.buffer.byteOffset,
    snapshot.buffer.byteLength,
  );

  const inputPlacesWithTokenValues = inputPlaces.filter(
    (place) => place.strideBytes > 0 && place.arcType !== "inhibitor",
  );
  const standardInputPlacesWithZeroStride = inputPlaces.filter(
    (place) => place.strideBytes === 0 && place.arcType === "standard",
  );

  const tokensCombinations = enumerateWeightedMarkingIndicesGenerator(
    inputPlacesWithTokenValues,
  );

  // The compiled buffer-ABI lambda reads token attributes at packed-struct
  // byte offsets straight from the shared views — no per-combination record
  // decoding. Place base offsets don't change across combinations.
  if (!fillPlaceBases(transition.placeBases, inputPlacesWithTokenValues)) {
    throw new SDCPNItemError(
      `The compiled program for transition \`${transition.name}\` does not match the net (input arc count changed). Recompile the artifacts from the current net.`,
      transition.id,
    );
  }

  for (const tokenCombinationIndices of tokensCombinations) {
    if (!fillTokenIndices(transition.indices, tokenCombinationIndices)) {
      throw new SDCPNItemError(
        `The compiled program for transition \`${transition.name}\` does not match the net (input token slot count changed). Recompile the artifacts from the current net.`,
        transition.id,
      );
    }

    let lambdaResult: ReturnType<typeof transition.lambdaFn>;
    try {
      lambdaResult = transition.lambdaFn(
        tokenViews.f64,
        tokenViews.u64,
        tokenViews.u8,
        transition.placeBases,
        transition.indices,
      );
    } catch (err) {
      throw new SDCPNItemError(
        `Error while executing lambda function for transition \`${
          transition.name
        }\`:\n\n${(err as Error).message}`,
        transition.id,
      );
    }

    // Predicate (boolean) lambdas fire in the same step their guard is true —
    // no stochastic delay. They must not go through the exp() test below,
    // which would map true to an Infinity rate.
    //
    // Numeric rates fire with the memoryless per-frame probability
    // 1 - e^(-lambda * dt): the exposure window is this frame's dt, so firing
    // counts converge to Poisson(lambda * t) as dt shrinks. Testing against
    // the accumulated time since the last firing instead would redraw U1
    // against an ever-growing CDF, which inflates effective rates — most for
    // rare events — and makes inter-firing times non-exponential.
    //
    // The first combination that passes fires. A shared U1 across
    // combinations under-approximates the superposition of per-combination
    // rates; acceptable while at most one firing per transition per frame.
    const fires =
      typeof lambdaResult === "boolean"
        ? lambdaResult
        : Math.exp(-lambdaResult * simulation.dt) <= U1;

    if (fires) {
      // Transition fires! The compiled kernel writes output tokens into the
      // transition's staging bytes; Distribution/uuid values are resolved
      // through the kernel sink, advancing the RNG state.
      let addMap: Record<PlaceID, Uint8Array[]>;
      let currentRngState = newRngState;

      if (transition.kernelFn === null) {
        // No colored output places — every output gets `weight` empty blocks.
        addMap = {};
        for (const outputPlace of transition.outputPlaces) {
          addMap[outputPlace.placeId] = Array.from(
            { length: outputPlace.weight },
            () => EMPTY_TOKEN_BYTES,
          );
        }
      } else {
        try {
          const { add, newRngState: rngAfterKernel } = executeBufferKernel({
            transition,
            views: tokenViews,
            rngState: newRngState,
          });
          addMap = add;
          currentRngState = rngAfterKernel;
        } catch (err) {
          throw err instanceof SDCPNItemError
            ? err
            : new SDCPNItemError(
                `Error while executing transition kernel for transition \`${
                  transition.name
                }\`:\n\n${(err as Error).message}`,
                transition.id,
              );
        }
      }

      return {
        firing: {
          // Map from place ID to set of token indices to remove
          // TODO: Need to provide better typing here, to not let TS infer to any[]
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          remove: Object.fromEntries([
            ...standardInputPlacesWithZeroStride.map((inputPlace) => [
              inputPlace.placeId,
              inputPlace.weight,
            ]),
            ...tokenCombinationIndices.flatMap(
              (placeTokenIndices, placeIndex) => {
                const inputArc = inputPlacesWithTokenValues[placeIndex]!;
                return inputArc.arcType === "standard"
                  ? [[inputArc.placeId, new Set(placeTokenIndices)]]
                  : [];
              },
            ),
          ]),
          // Map from place ID to array of packed token byte blocks to
          // create as per transition kernel output
          add: addMap,
        },
        newRngState: currentRngState,
      };
    }
  }

  // Enabled but not firing this frame; the draw is still consumed.
  return { firing: null, newRngState };
}
