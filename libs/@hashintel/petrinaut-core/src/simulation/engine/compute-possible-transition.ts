import { SDCPNItemError } from "../../errors";
import { isDistribution } from "../authoring/user-code/distribution";
import { materializeEngineFrame } from "../frames/internal-frame";
import { enumerateWeightedMarkingIndicesGenerator } from "./enumerate-weighted-markings";
import { sampleDistribution } from "./sample-distribution";
import { nextRandom } from "./seeded-rng";
import { decodeTokenRecord, encodeTokenAttributeValue } from "./token-values";

import type { ID } from "../../types/sdcpn";
import type {
  EngineFrame,
  SimulationInstance,
  TransitionTokenValues,
} from "./types";

type PlaceID = ID;

/**
 * Takes an EngineFrame, a SimulationInstance, a TransitionID, and computes the possible transition.
 * Returns null if no transition is possible.
 * Returns a record with:
 * - removed: Map from PlaceID to Set of token indices to remove.
 * - added: Map from PlaceID to array of token values to create.
 * - newRngState: Updated RNG seed after consuming randomness
 */
export function computePossibleTransition(
  frame: EngineFrame,
  simulation: SimulationInstance,
  transitionId: string,
  rngState: number,
): null | {
  remove: Record<PlaceID, Set<number> | number>;
  add: Record<PlaceID, number[][]>;
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

  // TODO: This should acumulate lambda over time, but for now we just consider that lambda is constant per combination.
  // (just multiply by time since last transition)

  const inputPlacesWithTokenValues = inputPlaces.filter(
    (place) => place.dimensions > 0 && place.arcType !== "inhibitor",
  );
  const standardInputPlacesWithZeroDimensions = inputPlaces.filter(
    (place) => place.dimensions === 0 && place.arcType === "standard",
  );

  // TODO: This should acumulate lambda over time, but for now we just consider that lambda is constant per combination.
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
      const placeOffsetInBuffer = inputPlace.offset;
      const dimensions = inputPlace.dimensions;

      if (!inputPlace.elementNames) {
        throw new SDCPNItemError(
          `Place \`${inputPlace.placeName}\` has no type defined`,
          inputPlace.placeId,
        );
      }
      const elements = inputPlace.elements;
      if (!elements) {
        throw new SDCPNItemError(
          `Place \`${inputPlace.placeName}\` has no type defined`,
          inputPlace.placeId,
        );
      }

      // Convert tokens for this place to objects with named dimensions
      const placeTokens = placeTokenIndices.map((tokenIndexInPlace) => {
        // Offset within the global buffer
        const globalIndex =
          placeOffsetInBuffer + tokenIndexInPlace * dimensions;

        return decodeTokenRecord(
          elements,
          snapshot.buffer.subarray(globalIndex, globalIndex + dimensions),
        );
      });

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
        }\n\nInput:\n${JSON.stringify(tokenCombinationValues, null, 2)}`,
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
          }\n\nInput:\n${JSON.stringify(tokenCombinationValues, null, 2)}`,
          transition.id,
        );
      }

      // Convert transition kernel output back to place-indexed format
      // The kernel returns { PlaceName: [{ x: 0, y: 0 }, ...], ... }
      // We need to convert this to place IDs and flatten to number[][]
      // Distribution values are sampled here, advancing the RNG state.
      const addMap: Record<PlaceID, number[][]> = {};
      let currentRngState = newRngState;

      for (const outputPlace of transition.outputPlaces) {
        const outputPlaceState = snapshot.places[outputPlace.placeId];
        if (!outputPlaceState) {
          throw new Error(
            `Output place with ID ${outputPlace.placeId} not found in frame`,
          );
        }

        // If place has no type, create n empty tuples where n is the arc weight
        if (!outputPlace.elementNames) {
          const emptyTokens: number[][] = Array.from(
            { length: outputPlace.weight },
            () => [],
          );
          addMap[outputPlace.placeId] = emptyTokens;
          continue;
        }

        const outputTokens = transitionKernelOutput[outputPlace.placeName];

        if (!outputTokens) {
          throw new SDCPNItemError(
            `Transition kernel for transition \`${transition.name}\` did not return tokens for place "${outputPlace.placeName}"`,
            transition.id,
          );
        }

        // Convert token objects back to number arrays in correct order,
        // sampling any Distribution values using the RNG
        const tokenArrays: number[][] = [];
        for (const token of outputTokens) {
          const values: number[] = [];
          for (const element of outputPlace.elements ?? []) {
            let raw = token[element.name];
            if (isDistribution(raw)) {
              if (element.type !== "real") {
                throw new Error(
                  `Transition ${transition.id} produced a distribution for discrete element ${element.name}.`,
                );
              }
              const [sampled, nextRng] = sampleDistribution(
                raw,
                currentRngState,
              );
              currentRngState = nextRng;
              raw = sampled;
            }
            values.push(
              encodeTokenAttributeValue(
                element,
                raw,
                `Transition ${transition.id} output ${outputPlace.placeName}.${element.name}`,
              ),
            );
          }
          tokenArrays.push(values);
        }

        addMap[outputPlace.placeId] = tokenArrays;
      }

      return {
        // Map from place ID to set of token indices to remove
        // TODO: Need to provide better typing here, to not let TS infer to any[]
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        remove: Object.fromEntries([
          ...standardInputPlacesWithZeroDimensions.map((inputPlace) => [
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
        // Map from place ID to array of token values to
        // create as per transition kernel output
        add: addMap,
        newRngState: currentRngState,
      };
    }
  }

  // No transition fired
  return null;
}
