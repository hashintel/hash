import { SDCPNItemError } from "../../core/errors";
import type { ID } from "../../core/types/sdcpn";
import { enumerateWeightedMarkingIndicesGenerator } from "./enumerate-weighted-markings";
import { nextRandom } from "./seeded-rng";
import type { SimulationFrame, SimulationInstance } from "./types";

type PlaceID = ID;

/**
 * Takes a SimulationFrame, a SimulationInstance, a TransitionID, and computes the possible transition.
 * Returns null if no transition is possible.
 * Returns a record with:
 * - removed: Map from PlaceID to Set of token indices to remove.
 * - added: Map from PlaceID to array of token values to create.
 * - newRngState: Updated RNG seed after consuming randomness
 */
export function computePossibleTransition(
  frame: SimulationFrame,
  simulation: SimulationInstance,
  transitionId: string,
): null | {
  remove: Record<PlaceID, Set<number> | number>;
  add: Record<PlaceID, number[][]>;
  newRngState: number;
} {
  // Get the transition from the simulation instance
  const transition = frame.transitions.get(transitionId);
  if (!transition) {
    throw new Error(`Transition with ID ${transitionId} not found.`);
  }

  // Gather input places with their weights relative to this transition.
  const inputPlaces = transition.instance.inputArcs.map((arc) => {
    const placeState = frame.places.get(arc.placeId);
    if (!placeState) {
      throw new Error(
        `Place with ID ${arc.placeId} not found in current marking.`,
      );
    }

    return { ...placeState, weight: arc.weight };
  });

  // Transition is enabled if all input places have more tokens than the arc weight.
  const isTransitionEnabled = inputPlaces.every(
    (inputPlace) => inputPlace.count >= inputPlace.weight,
  );

  // Return null if not enabled
  if (!isTransitionEnabled) {
    return null;
  }

  // Get lambda function
  const lambdaFn = simulation.lambdaFns.get(transitionId);
  if (!lambdaFn) {
    throw new Error(
      `Lambda function for transition ${transitionId} not found.`,
    );
  }

  // Get transition kernel function
  const transitionKernelFn = simulation.transitionKernelFns.get(transitionId);
  if (!transitionKernelFn) {
    throw new Error(
      `Transition kernel fn for transition ${transitionId} not found.`,
    );
  }

  //
  // Transition computation logic
  //

  // Generate random number using seeded RNG and update state
  const [U1, newRngState] = nextRandom(simulation.rngState);
  const { timeSinceLastFiringMs } = transition;

  // TODO: This should acumulate lambda over time, but for now we just consider that lambda is constant per combination.
  // (just multiply by time since last transition)

  const inputPlacesWithAtLeastOneDimension = inputPlaces.filter(
    (place) => place.dimensions > 0,
  );
  const inputPlacesWithZeroDimensions = inputPlaces.filter(
    (place) => place.dimensions === 0,
  );

  // TODO: This should acumulate lambda over time, but for now we just consider that lambda is constant per combination.
  // (just multiply by time since last transition)
  const tokensCombinations = enumerateWeightedMarkingIndicesGenerator(
    inputPlacesWithAtLeastOneDimension,
  );

  for (const tokenCombinationIndices of tokensCombinations) {
    // Expensive: get token values from global buffer
    // And transform them for lambda function input.
    // Convert to object format with place names as keys
    const tokenCombinationValues: Record<string, Record<string, number>[]> = {};

    for (const [
      placeIndex,
      placeTokenIndices,
    ] of tokenCombinationIndices.entries()) {
      const inputPlace = inputPlacesWithAtLeastOneDimension[placeIndex]!;
      const placeOffsetInBuffer = inputPlace.offset;
      const dimensions = inputPlace.dimensions;
      const placeName = inputPlace.instance.name;

      // Get the type definition to access dimension names
      const typeId = inputPlace.instance.colorId;
      if (!typeId) {
        throw new SDCPNItemError(
          `Place \`${inputPlace.instance.name}\` has no type defined`,
          inputPlace.instance.id,
        );
      }

      const type = simulation.types.get(typeId);
      if (!type) {
        throw new Error(
          `Type with ID ${typeId} referenced by place ${inputPlace.instance.id} does not exist in simulation`,
        );
      }

      // Convert tokens for this place to objects with named dimensions
      const placeTokens: Record<string, number>[] = placeTokenIndices.map(
        (tokenIndexInPlace) => {
          // Offset within the global buffer
          const globalIndex =
            placeOffsetInBuffer + tokenIndexInPlace * dimensions;

          // Create token object with named dimensions
          const token: Record<string, number> = {};
          for (let dimIdx = 0; dimIdx < dimensions; dimIdx++) {
            const dimensionName = type.elements[dimIdx]!.name;
            token[dimensionName] = frame.buffer[globalIndex + dimIdx]!;
          }
          return token;
        },
      );

      tokenCombinationValues[placeName] = placeTokens;
    }

    // Approximate by just multiplying by elapsed time since last transition,
    // not a real accumulation over time with lambda varying as the paper suggests.
    // But prevent having to handle a big buffer of varying lambda values over time,
    // which should be reordered in case of new tokens arriving.
    let lambdaResult: ReturnType<typeof lambdaFn>;
    try {
      lambdaResult = lambdaFn(
        tokenCombinationValues,
        simulation.parameterValues,
      );
    } catch (err) {
      throw new SDCPNItemError(
        `Error while executing lambda function for transition \`${transition.instance.name}\`:\n\n${
          (err as Error).message
        }\n\nInput:\n${JSON.stringify(tokenCombinationValues, null, 2)}`,
        transition.instance.id,
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
      let transitionKernelOutput: ReturnType<typeof transitionKernelFn>;
      try {
        // Transition fires!
        // Return result of the transition kernel as is (no stochasticity for now, only one result)
        transitionKernelOutput = transitionKernelFn(
          tokenCombinationValues,
          simulation.parameterValues,
        );
      } catch (err) {
        throw new SDCPNItemError(
          `Error while executing transition kernel for transition \`${transition.instance.name}\`:\n\n${
            (err as Error).message
          }\n\nInput:\n${JSON.stringify(tokenCombinationValues, null, 2)}`,
          transition.instance.id,
        );
      }

      // Convert transition kernel output back to place-indexed format
      // The kernel returns { PlaceName: [{ x: 0, y: 0 }, ...], ... }
      // We need to convert this to place IDs and flatten to number[][]
      const addMap: Record<PlaceID, number[][]> = {};

      for (const outputArc of transition.instance.outputArcs) {
        const outputPlace = frame.places.get(outputArc.placeId);
        if (!outputPlace) {
          throw new Error(
            `Output place with ID ${outputArc.placeId} not found in frame`,
          );
        }

        const placeName = outputPlace.instance.name;
        const typeId = outputPlace.instance.colorId;

        // If place has no type, create n empty tuples where n is the arc weight
        if (!typeId) {
          const emptyTokens: number[][] = Array.from(
            { length: outputArc.weight },
            () => [],
          );
          addMap[outputArc.placeId] = emptyTokens;
          continue;
        }

        const outputTokens = transitionKernelOutput[placeName];

        if (!outputTokens) {
          throw new SDCPNItemError(
            `Transition kernel for transition \`${transition.instance.name}\` did not return tokens for place "${placeName}"`,
            transition.instance.id,
          );
        }

        const type = simulation.types.get(typeId);
        if (!type) {
          throw new Error(
            `Type with ID ${typeId} referenced by place ${outputPlace.instance.id} does not exist in simulation`,
          );
        }

        // Convert token objects back to number arrays in correct order
        const tokenArrays = outputTokens.map((token) => {
          return type.elements.map((element) => token[element.name]!);
        });

        addMap[outputArc.placeId] = tokenArrays;
      }

      return {
        // Map from place ID to set of token indices to remove
        // TODO: Need to provide better typing here, to not let TS infer to any[]
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        remove: Object.fromEntries([
          ...inputPlacesWithZeroDimensions.map((place) => {
            return [place.instance.id, place.weight];
          }),
          ...tokenCombinationIndices.map((placeTokenIndices, placeIndex) => {
            const inputArc = inputPlacesWithAtLeastOneDimension[placeIndex]!;
            return [inputArc.instance.id, new Set(placeTokenIndices)];
          }),
        ]),
        // Map from place ID to array of token values to
        // create as per transition kernel output
        add: addMap,
        newRngState,
      };
    }
  }

  // No transition fired
  return null;
}
