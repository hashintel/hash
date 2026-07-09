import { SDCPNItemError } from "../../errors";
import { materializeEngineFrame } from "../frames/internal-frame";
import { encodeKernelOutputToken } from "./encode-kernel-token";
import { enumerateWeightedMarkingIndicesGenerator } from "./enumerate-weighted-markings";
import { nextRandom } from "./seeded-rng";
import { createTokenRegionViews, readTokenRecord } from "./token-layout";
import { describeTokenValuesForError } from "./token-values";

import type { ID } from "../../types/sdcpn";
import type {
  EngineFrame,
  SimulationInstance,
  TransitionTokenValues,
} from "./types";

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

  for (const tokenCombinationIndices of tokensCombinations) {
    // Expensive: get token values from global buffer
    // And transform them for lambda function input.
    // Convert to object format with place names as keys
    const tokenCombinationValues: TransitionTokenValues = {};

    for (const [
      placeIndex,
      placeTokenIndices,
    ] of tokenCombinationIndices.entries()) {
      const inputPlace = inputPlacesWithTokenValues[placeIndex]!;
      const placeByteOffset = inputPlace.byteOffset;
      const strideBytes = inputPlace.strideBytes;

      const tokenLayout = inputPlace.tokenLayout;
      if (!tokenLayout) {
        throw new SDCPNItemError(
          `Place \`${inputPlace.placeName}\` has no type defined`,
          inputPlace.placeId,
        );
      }

      // Convert tokens for this place to objects with named dimensions
      const placeTokens = placeTokenIndices.map((tokenIndexInPlace) =>
        readTokenRecord(
          tokenLayout,
          tokenViews,
          placeByteOffset + tokenIndexInPlace * strideBytes,
          simulation.stringPool,
        ),
      );

      tokenCombinationValues[inputPlace.placeName] = placeTokens;
    }

    // Approximate by just multiplying by elapsed time since last transition,
    // not a real accumulation over time with lambda varying as the paper suggests.
    // But prevent having to handle a big buffer of varying lambda values over time,
    // which should be reordered in case of new tokens arriving.
    let lambdaResult: ReturnType<typeof transition.lambdaFn>;
    try {
      lambdaResult = transition.lambdaFn(tokenCombinationValues);
    } catch (err) {
      throw new SDCPNItemError(
        `Error while executing lambda function for transition \`${transition.name}\`:\n\n${
          (err as Error).message
        }\n\nInput:\n${describeTokenValuesForError(tokenCombinationValues)}`,
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
      let transitionKernelOutput: ReturnType<
        typeof transition.transitionKernelFn
      >;
      try {
        // Transition fires!
        // Return result of the transition kernel as is (no stochasticity for now, only one result)
        transitionKernelOutput = transition.transitionKernelFn(
          tokenCombinationValues,
        );
      } catch (err) {
        throw new SDCPNItemError(
          `Error while executing transition kernel for transition \`${transition.name}\`:\n\n${
            (err as Error).message
          }\n\nInput:\n${describeTokenValuesForError(tokenCombinationValues)}`,
          transition.id,
        );
      }

      // Convert transition kernel output back to place-indexed format
      // The kernel returns { PlaceName: [{ x: 0, y: 0 }, ...], ... }
      // We need to convert this to place IDs and pack each token into its
      // stride-sized byte block.
      // Distribution values are sampled here, advancing the RNG state.
      const addMap: Record<PlaceID, Uint8Array[]> = {};
      let currentRngState = newRngState;

      for (const outputPlace of transition.outputPlaces) {
        const outputPlaceState = snapshot.places[outputPlace.placeId];
        if (!outputPlaceState) {
          throw new Error(
            `Output place with ID ${outputPlace.placeId} not found in frame`,
          );
        }

        // If place has no type, create n empty blocks where n is the arc weight
        if (!outputPlace.tokenLayout) {
          addMap[outputPlace.placeId] = Array.from(
            { length: outputPlace.weight },
            () => EMPTY_TOKEN_BYTES,
          );
          continue;
        }

        const outputTokens = transitionKernelOutput[outputPlace.placeName];

        if (!outputTokens) {
          throw new SDCPNItemError(
            `Transition kernel for transition \`${transition.name}\` did not return tokens for place "${outputPlace.placeName}"`,
            transition.id,
          );
        }

        // Resolve Distribution samples and uuid values using the RNG (in
        // element declaration order), then pack each token into a
        // stride-sized byte block.
        const tokenBlocks: Uint8Array[] = [];
        for (const token of outputTokens) {
          const { bytes, nextRngState } = encodeKernelOutputToken({
            token,
            elements: outputPlace.elements ?? [],
            tokenLayout: outputPlace.tokenLayout,
            rngState: currentRngState,
            transitionId: transition.id,
            placeName: outputPlace.placeName,
            stringPool: simulation.stringPool,
          });
          currentRngState = nextRngState;
          tokenBlocks.push(bytes);
        }

        addMap[outputPlace.placeId] = tokenBlocks;
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
