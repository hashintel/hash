/* eslint-disable curly */

import type { ID } from "../types/sdcpn";
import type { SimulationFrame } from "../types/simulation";
import { enumerateWeightedMarkingIndicesGenerator } from "./enumerate-weighted-markings";

type PlaceID = ID;

/**
 * Takes a SimulationFrame, a TransitionID, and computes the possible transition.
 * Returns null if no transition is possible.
 * Returns a record with:
 * - removed: Map from PlaceID to Set of token indices to remove.
 * - added: Map from PlaceID to array of token values to create.
 */
export function computePossibleTransition(
  frame: SimulationFrame,
  transitionId: string,
): null | {
  remove: Record<PlaceID, Set<number>>;
  add: Record<PlaceID, number[][]>;
} {
  const { simulation } = frame;

  // Get the transition from the simulation instance
  const transition = frame.transitions.get(transitionId);
  if (!transition)
    throw new Error(`Transition with ID ${transitionId} not found.`);

  // Gather input places with their weights relative to this transition.
  const inputPlaces = transition.instance.inputArcs.map((arc) => {
    const placeState = frame.places.get(arc.placeId);
    if (!placeState)
      throw new Error(
        `Place with ID ${arc.placeId} not found in current marking.`,
      );

    return { ...placeState, weight: arc.weight };
  });

  // Transition is enabled if all input places have more tokens than the arc weight.
  const isTransitionEnabled = inputPlaces.every(
    (inputPlace) => inputPlace.count >= inputPlace.weight,
  );

  // Return null if not enabled
  if (!isTransitionEnabled) return null;

  // Get lambda function
  const lambdaFn = simulation.lambdaFns.get(transitionId);
  if (!lambdaFn)
    throw new Error(
      `Lambda function for transition ${transitionId} not found.`,
    );

  // Get transition kernel function
  const transitionKernelFn = simulation.transitionKernelFns.get(transitionId);
  if (!transitionKernelFn)
    throw new Error(
      `Transition kernel fn for transition ${transitionId} not found.`,
    );

  //
  // Transition computation logic
  //

  // Define U1 ~ Uniform(0,1)
  const U1 = Math.random(); // TODO: Use simulation RNG
  const { timeSinceLastFiring } = transition;

  // TODO: This should acumulate lambda over time, but for now we just consider that lambda is constant per combination.
  // (just multiply by time since last transition)
  const tokensCombinations =
    enumerateWeightedMarkingIndicesGenerator(inputPlaces);

  for (const tokenCombinationIndices of tokensCombinations) {
    // Expensive: get token values from global buffer
    // And transform them for lambda function input.
    // Ideally we could just provide offsets to the lambda function directly
    // and remove part of this complexity.
    const tokenCombinationValues = tokenCombinationIndices.map(
      (placeTokenIndices, placeIndex) => {
        const placeOffsetInBuffer = inputPlaces[placeIndex]!.offset;
        const dimensions = inputPlaces[placeIndex]!.instance.dimensions;

        return placeTokenIndices.map((tokenIndexInPlace) => {
          // Offset within the global buffer
          const globalIndex =
            placeOffsetInBuffer + tokenIndexInPlace * dimensions;

          // Recreate a tuple from buffer to give to lambda function
          // This could be optimized by passing the buffer and offset directly to the lambda function
          return Array.from({ length: dimensions }).map(
            (_, i) => frame.buffer[globalIndex + i]!,
          );
        });
      },
    );

    // Approximate by just multiplying by elapsed time since last transition,
    // not a real accumulation over time with lambda varying as the paper suggests.
    // But prevent having to handle a big buffer of varying lambda values over time,
    // which should be reordered in case of new tokens arriving.
    const lambdaValue = lambdaFn(tokenCombinationValues) * timeSinceLastFiring;

    // Find the first combination of tokens where e^(-lambda) < U1
    // We should normally find the minimum for all possibilities, but we try to reduce as much as we can here.
    if (Math.exp(-lambdaValue) <= U1) {
      // Transition fires!
      // Return result of the transition kernel as is (no stochasticity for now, only one result)
      const transitionKernelOutput = transitionKernelFn(tokenCombinationValues);

      return {
        // Map from place ID to set of token indices to remove
        remove: Object.fromEntries(
          tokenCombinationIndices.map((placeTokenIndices, placeIndex) => {
            const inputArc = transition.instance.inputArcs[placeIndex]!;
            return [inputArc.placeId, new Set(placeTokenIndices)];
          }),
        ),
        // Map from place ID to array of token values to
        // create as per transition kernel output
        add: Object.fromEntries(
          transitionKernelOutput.map((outputTokens, outputIndex) => {
            const outputArc = transition.instance.outputArcs[outputIndex]!;
            return [outputArc.placeId, outputTokens];
          }),
        ),
      };
    }
  }

  // No transition fired
  return null;
}
