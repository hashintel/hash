import { SDCPNItemError } from "../../../errors";
import {
  executeBufferKernel,
  fillInputCounts,
  fillPlaceBases,
  fillTokenIndices,
} from "../../engine/buffer-transition";
import { hasCapacityHeadroom } from "../../engine/capacity";
import {
  enumerateWeightedMarkingIndicesGenerator,
  firstWeightedMarkingIndices,
} from "../../engine/enumerate-weighted-markings";
import { getPlaceIndex } from "../../monte-carlo/layout";

import type { CompiledTransition } from "../../engine/types";
import type { MonteCarloFrameBuffer } from "../../monte-carlo/frame-buffer";
import type {
  MonteCarloRunState,
  PlaceID,
  TransitionEffect,
} from "../../monte-carlo/internal-types";

/**
 * One way a transition can fire from a frame: a transition and the tokens
 * it would consume, with the rate its lambda gives that choice.
 */
export type FiringMode = {
  transition: CompiledTransition;
  /**
   * The selected token indices per coloured non-inhibitor input arc, in arc
   * order. Empty when no input arc is coloured.
   */
  combination: readonly (readonly number[])[];
  /** Firings per unit time; `Infinity` for a predicate that holds. */
  rate: number;
};

export type Hazards = {
  /**
   * Every mode with a positive rate, in net order. Ends at `immediate` when
   * there is one: nothing after it is evaluated.
   */
  modes: FiringMode[];
  /** Sum of the finite rates in `modes`. */
  total: number;
  /** The first mode whose predicate holds, which fires without delay. */
  immediate: FiringMode | null;
};

type InputPlaceSlice = CompiledTransition["inputPlaces"][number] & {
  placeIndex: number;
  count: number;
  byteOffset: number;
  strideBytes: number;
};

const inputSlices = (
  run: MonteCarloRunState,
  frame: MonteCarloFrameBuffer,
  transition: CompiledTransition,
): InputPlaceSlice[] => {
  const { frameLayout } = run.simulation;
  return transition.inputPlaces.map((inputPlace) => {
    const placeIndex = getPlaceIndex(frameLayout, inputPlace.placeId);
    return {
      ...inputPlace,
      placeIndex,
      count: frame.placeCounts[placeIndex] ?? 0,
      byteOffset: frame.placeOffsets[placeIndex] ?? 0,
      strideBytes: frameLayout.placeStrideBytes[placeIndex] ?? 0,
    };
  });
};

const withValues = (slices: readonly InputPlaceSlice[]): InputPlaceSlice[] =>
  slices.filter(
    (place) => place.strideBytes > 0 && place.arcType !== "inhibitor",
  );

const bindCombination = (
  transition: CompiledTransition,
  colouredInputs: readonly InputPlaceSlice[],
  combination: readonly (readonly number[])[],
): void => {
  if (!fillPlaceBases(transition.placeBases, colouredInputs)) {
    throw new SDCPNItemError(
      `The compiled program for transition \`${transition.name}\` does not match the net (input arc count changed). Recompile the artifacts from the current net.`,
      transition.id,
    );
  }
  if (!fillTokenIndices(transition.indices, combination)) {
    throw new SDCPNItemError(
      `The compiled program for transition \`${transition.name}\` does not match the net (input token slot count changed). Recompile the artifacts from the current net.`,
      transition.id,
    );
  }
};

/**
 * Every way the frame's transitions can fire, with their rates. A disabled
 * transition, one blocked by a full output place, or a mode whose lambda
 * returns a rate of zero or `false` contributes nothing. Each token
 * combination counts as a mode of its own, so a transition's rate is the
 * sum over its combinations; a lambda that reads no input token is
 * evaluated once, on the first combination, since every combination would
 * give the same rate. The evaluation ends at the first mode whose predicate
 * holds, since that mode fires before any rate is drawn from.
 */
export function evaluateHazards(
  run: MonteCarloRunState,
  frame: MonteCarloFrameBuffer,
): Hazards {
  const modes: FiringMode[] = [];
  let total = 0;

  for (const transitionId of run.simulation.frameLayout.transitionIds) {
    const transition = run.simulation.compiledTransitions.get(transitionId);
    if (!transition) {
      throw new Error(`Compiled transition ${transitionId} not found`);
    }
    const slices = inputSlices(run, frame, transition);
    const enabled = slices.every((place) =>
      place.arcType === "inhibitor"
        ? place.count < place.weight
        : place.count >= place.weight,
    );
    if (!enabled) {
      continue;
    }
    if (
      transition.capacityConstraints.length > 0 &&
      !hasCapacityHeadroom(
        transition.capacityConstraints,
        frame.placeCounts,
        null,
      )
    ) {
      continue;
    }

    const colouredInputs = withValues(slices);
    fillInputCounts(transition.inputCounts, slices);
    const combinations = transition.lambdaReadsNoInputTokens
      ? [firstWeightedMarkingIndices(colouredInputs)]
      : enumerateWeightedMarkingIndicesGenerator(colouredInputs);

    for (const combination of combinations) {
      bindCombination(transition, colouredInputs, combination);
      let result: number | boolean;
      try {
        result = transition.lambdaFn(
          frame.tokenViews.f64,
          frame.tokenViews.u64,
          frame.tokenViews.u8,
          transition.placeBases,
          transition.indices,
          transition.inputCounts,
        );
      } catch (error) {
        throw new SDCPNItemError(
          `Error while executing lambda function for transition \`${
            transition.name
          }\`:\n\n${(error as Error).message}`,
          transition.id,
        );
      }
      const rate =
        typeof result === "boolean"
          ? result
            ? Number.POSITIVE_INFINITY
            : 0
          : result;
      if (!(rate > 0)) {
        continue;
      }
      // The enumeration reuses its arrays between combinations.
      const mode: FiringMode = {
        transition,
        combination: combination.map((indices) => [...indices]),
        rate,
      };
      modes.push(mode);
      if (rate === Number.POSITIVE_INFINITY) {
        return { modes, total, immediate: mode };
      }
      total += rate;
    }
  }

  return { modes, total, immediate: null };
}

/**
 * The tokens a mode's firing removes and adds, evaluated on `frame`: the
 * kernel reads the selected input tokens from it. Distribution-valued
 * outputs draw from `rngState`.
 */
export function computeFiringEffect(
  run: MonteCarloRunState,
  frame: MonteCarloFrameBuffer,
  mode: FiringMode,
  rngState: number,
): TransitionEffect & { newRngState: number } {
  const { transition } = mode;
  const slices = inputSlices(run, frame, transition);
  const colouredInputs = withValues(slices);
  bindCombination(transition, colouredInputs, mode.combination);

  let add: Record<PlaceID, Uint8Array[]>;
  let newRngState = rngState;
  if (transition.kernelFn === null) {
    add = {};
    for (const outputPlace of transition.outputPlaces) {
      add[outputPlace.placeId] = Array.from(
        { length: outputPlace.weight },
        () => new Uint8Array(0),
      );
    }
  } else {
    try {
      const kernel = executeBufferKernel({
        transition,
        views: frame.tokenViews,
        rngState,
      });
      add = kernel.add;
      newRngState = kernel.newRngState;
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
  for (const place of slices) {
    if (place.strideBytes === 0 && place.arcType === "standard") {
      remove[place.placeId] = place.weight;
    }
  }
  for (const [index, tokenIndices] of mode.combination.entries()) {
    const place = colouredInputs[index]!;
    if (place.arcType === "standard") {
      remove[place.placeId] = new Set(tokenIndices);
    }
  }

  return { remove, add, newRngState };
}
