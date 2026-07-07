import { SDCPNItemError } from "../../errors";
import { isDistribution } from "../authoring/user-code/distribution";
import { enumerateWeightedMarkingIndicesGenerator } from "../engine/enumerate-weighted-markings";
import { sampleDistribution } from "../engine/sample-distribution";
import { nextRandom } from "../engine/seeded-rng";
import {
  encodeTokenValuesToBytes,
  readTokenRecord,
} from "../engine/token-layout";
import { encodeTokenAttributeValue } from "../engine/token-values";
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
      byteOffset: frame.placeOffsets[placeIndex] ?? 0,
      strideBytes: frameLayout.placeStrideBytes[placeIndex] ?? 0,
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
    (place) => place.strideBytes > 0 && place.arcType !== "inhibitor",
  );
  const standardInputPlacesWithoutValues = inputPlaces.filter(
    (place) => place.strideBytes === 0 && place.arcType === "standard",
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
      const { strideBytes, byteOffset } = inputPlace;
      const tokenLayout = inputPlace.tokenLayout;
      if (!tokenLayout) {
        throw new SDCPNItemError(
          `Place \`${inputPlace.placeName}\` has no type defined`,
          inputPlace.placeId,
        );
      }

      tokenValues[inputPlace.placeName] = tokenIndices.map((tokenIndex) =>
        readTokenRecord(
          tokenLayout,
          frame.tokenF64,
          frame.tokenBytes,
          byteOffset + tokenIndex * strideBytes,
        ),
      );
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

    const add: Record<PlaceID, Uint8Array[]> = {};
    let currentRngState = candidateRngState;
    for (const outputPlace of transition.outputPlaces) {
      const outputPlaceIndex = getPlaceIndex(frameLayout, outputPlace.placeId);
      const strideBytes = frameLayout.placeStrideBytes[outputPlaceIndex] ?? 0;

      if (!outputPlace.tokenLayout) {
        add[outputPlace.placeId] = Array.from(
          { length: outputPlace.weight },
          () => new Uint8Array(0),
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

      const tokenBlocks: Uint8Array[] = [];
      for (const token of outputTokens) {
        const encodedByName: Record<string, number> = {};
        for (const element of outputPlace.elements ?? []) {
          let rawValue = token[element.name];
          if (isDistribution(rawValue)) {
            if (element.type !== "real") {
              throw new Error(
                `Transition ${transition.id} produced a distribution for discrete element ${element.name}.`,
              );
            }
            const [sampled, nextRngState] = sampleDistribution(
              rawValue,
              currentRngState,
            );
            currentRngState = nextRngState;
            rawValue = sampled;
          }
          encodedByName[element.name] = encodeTokenAttributeValue(
            element,
            rawValue,
            `Transition ${transition.id} output ${outputPlace.placeName}.${element.name}`,
          );
        }

        const block = encodeTokenValuesToBytes(
          outputPlace.tokenLayout,
          encodedByName,
        );
        if (block.byteLength !== strideBytes) {
          throw new Error(
            `Transition ${transition.id} produced a ${block.byteLength}-byte token for place ${outputPlace.placeId}, expected ${strideBytes}`,
          );
        }
        tokenBlocks.push(block);
      }
      add[outputPlace.placeId] = tokenBlocks;
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
      remove,
      add,
      newRngState: currentRngState,
    };
  }

  return null;
}
