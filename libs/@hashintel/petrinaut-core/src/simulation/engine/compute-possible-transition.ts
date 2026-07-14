import { SDCPNItemError } from "../../errors";
import { materializeEngineFrame } from "../frames/internal-frame";
import {
  executeBufferKernel,
  fillPlaceBases,
  fillTokenIndices,
} from "./buffer-transition";
import { enumerateWeightedMarkingIndicesGenerator } from "./enumerate-weighted-markings";
import { nextRandom } from "./seeded-rng";
import { createTokenRegionViews } from "./token-layout";

import type { ID } from "../../types/sdcpn";
import type { EngineFrame, SimulationInstance } from "./types";

type PlaceID = ID;

const EMPTY_TOKEN_BYTES = new Uint8Array(0);

/**
 * Takes an EngineFrame, a SimulationInstance, a TransitionID, and computes the possible transition.
 * Returns null if no transition is possible.
 * Returns a record with:
 * - removed: Map from PlaceID to Set of token indices to remove.
 * - added: Map from PlaceID to array of packed token byte blocks to create.
 * - newRngState: Updated RNG seed after consuming randomness
 */
export function computePossibleTransition(
  frame: EngineFrame,
  simulation: SimulationInstance,
  transitionId: string,
  rngState: number,
): null | {
  remove: Record<PlaceID, Set<number> | number>;
  add: Record<PlaceID, Uint8Array[]>;
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

  // Return null if not enabled
  if (!isTransitionEnabled) {
    return null;
  }

  //
  // Transition computation logic
  //

  // Generate random number using seeded RNG and update state
  const [U1, newRngState] = nextRandom(rngState);
  const { timeSinceLastFiringMs } = transitionState;

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

  // TODO: This should accumulate lambda over time, but for now we just consider that lambda is constant per combination.
  // (just multiply by time since last transition)
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

    // Approximate by just multiplying by elapsed time since last transition,
    // not a real accumulation over time with lambda varying as the paper suggests.
    // But prevent having to handle a big buffer of varying lambda values over time,
    // which should be reordered in case of new tokens arriving.
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

    // Convert boolean lambda results to numbers: true -> Infinity, false -> 0
    const lambdaNumeric =
      typeof lambdaResult === "boolean"
        ? lambdaResult
          ? Number.POSITIVE_INFINITY
          : 0
        : lambdaResult;

    const lambdaValue = lambdaNumeric * timeSinceLastFiringMs;

    // Find the first combination of tokens where e^(-lambda) < U1
    // We should normally find the minimum for all possibilities, but we try to reduce as much as we can here.
    if (Math.exp(-lambdaValue) <= U1) {
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
        newRngState: currentRngState,
      };
    }
  }

  // No transition fired
  return null;
}
