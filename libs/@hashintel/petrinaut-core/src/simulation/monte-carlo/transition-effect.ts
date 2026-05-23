import { SDCPNItemError } from "../../errors";
import { isDistribution } from "../authoring/user-code/distribution";
import { enumerateWeightedMarkingIndicesGenerator } from "../engine/enumerate-weighted-markings";
import { sampleDistribution } from "../engine/sample-distribution";
import { nextRandom } from "../engine/seeded-rng";
import { getPlaceIndex, getTransitionIndex } from "./layout";

import type {
  CompiledTransition,
  TransitionTokenValues,
} from "../engine/types";
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
): TransitionEffect | null {
  const { frameLayout } = run.simulation;
  const transitionIndex = getTransitionIndex(frameLayout, transition.id);

  const inputPlaces = transition.inputPlaces.map((inputPlace) => {
    const placeIndex = getPlaceIndex(frameLayout, inputPlace.placeId);

    return {
      ...inputPlace,
      placeIndex,
      count: frame.placeCounts[placeIndex] ?? 0,
      offset: frame.placeOffsets[placeIndex] ?? 0,
      dimensions: frameLayout.placeDimensions[placeIndex] ?? 0,
    };
  });

  const enabled = inputPlaces.every((inputPlace) =>
    inputPlace.arcType === "inhibitor"
      ? inputPlace.count < inputPlace.weight
      : inputPlace.count >= inputPlace.weight,
  );
  if (!enabled) {
    return null;
  }

  const [u1, candidateRngState] = nextRandom(run.rngState);
  const timeSinceLastFiring =
    (frame.transitionElapsedFrames[transitionIndex] ?? 0) * run.simulation.dt;
  const inputPlacesWithValues = inputPlaces.filter(
    (place) => place.dimensions > 0 && place.arcType !== "inhibitor",
  );
  const inputPlacesWithoutValues = inputPlaces.filter(
    (place) => place.dimensions === 0 && place.arcType !== "inhibitor",
  );

  const tokenCombinations = enumerateWeightedMarkingIndicesGenerator(
    inputPlacesWithValues,
  );

  for (const tokenCombinationIndices of tokenCombinations) {
    const tokenValues: TransitionTokenValues = {};

    for (const [
      placeIndex,
      tokenIndices,
    ] of tokenCombinationIndices.entries()) {
      const inputPlace = inputPlacesWithValues[placeIndex]!;
      const { dimensions, offset } = inputPlace;
      if (!inputPlace.elementNames) {
        throw new SDCPNItemError(
          `Place \`${inputPlace.placeName}\` has no type defined`,
          inputPlace.placeId,
        );
      }
      const elementNames = inputPlace.elementNames;

      tokenValues[inputPlace.placeName] = tokenIndices.map((tokenIndex) => {
        const tokenOffset = offset + tokenIndex * dimensions;
        const token: Record<string, number> = {};
        for (let dimension = 0; dimension < dimensions; dimension++) {
          token[elementNames[dimension]!] =
            frame.tokenValues[tokenOffset + dimension]!;
        }
        return token;
      });
    }

    let lambdaResult: ReturnType<typeof transition.lambdaFn>;
    try {
      lambdaResult = transition.lambdaFn(tokenValues);
    } catch (error) {
      throw new SDCPNItemError(
        `Error while executing lambda function for transition \`${transition.name}\`:\n\n${
          (error as Error).message
        }\n\nInput:\n${JSON.stringify(tokenValues, null, 2)}`,
        transition.id,
      );
    }

    const lambdaNumeric =
      typeof lambdaResult === "boolean"
        ? lambdaResult
          ? Number.POSITIVE_INFINITY
          : 0
        : lambdaResult;
    const lambdaValue = lambdaNumeric * timeSinceLastFiring;
    if (Math.exp(-lambdaValue) > u1) {
      continue;
    }

    let kernelOutput: ReturnType<typeof transition.transitionKernelFn>;
    try {
      kernelOutput = transition.transitionKernelFn(tokenValues);
    } catch (error) {
      throw new SDCPNItemError(
        `Error while executing transition kernel for transition \`${transition.name}\`:\n\n${
          (error as Error).message
        }\n\nInput:\n${JSON.stringify(tokenValues, null, 2)}`,
        transition.id,
      );
    }

    const add: Record<PlaceID, number[][]> = {};
    let currentRngState = candidateRngState;
    for (const outputPlace of transition.outputPlaces) {
      const outputPlaceIndex = getPlaceIndex(frameLayout, outputPlace.placeId);
      const dimensions = frameLayout.placeDimensions[outputPlaceIndex] ?? 0;

      if (!outputPlace.elementNames) {
        add[outputPlace.placeId] = Array.from(
          { length: outputPlace.weight },
          () => [],
        );
        continue;
      }

      const outputTokens = kernelOutput[outputPlace.placeName];
      if (!outputTokens) {
        throw new SDCPNItemError(
          `Transition kernel for transition \`${transition.name}\` did not return tokens for place "${outputPlace.placeName}"`,
          transition.id,
        );
      }

      const tokenArrays: number[][] = [];
      for (const token of outputTokens) {
        const values: number[] = [];
        for (const elementName of outputPlace.elementNames) {
          const rawValue = token[elementName]!;
          if (isDistribution(rawValue)) {
            const [sampled, nextRngState] = sampleDistribution(
              rawValue,
              currentRngState,
            );
            currentRngState = nextRngState;
            values.push(sampled);
          } else {
            values.push(rawValue);
          }
        }

        if (values.length !== dimensions) {
          throw new Error(
            `Transition ${transition.id} produced ${values.length} values for place ${outputPlace.placeId}, expected ${dimensions}`,
          );
        }
        tokenArrays.push(values);
      }
      add[outputPlace.placeId] = tokenArrays;
    }

    const remove: TransitionEffect["remove"] = {};
    for (const inputPlace of inputPlacesWithoutValues) {
      remove[inputPlace.placeId] = inputPlace.weight;
    }
    for (const [index, tokenIndices] of tokenCombinationIndices.entries()) {
      const inputPlace = inputPlacesWithValues[index]!;
      remove[inputPlace.placeId] = new Set(tokenIndices);
    }

    return {
      remove,
      add,
      newRngState: currentRngState,
    };
  }

  return null;
}
