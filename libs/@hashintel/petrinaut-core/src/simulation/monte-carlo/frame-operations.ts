/* eslint-disable no-param-reassign -- Monte Carlo frame buffers are mutable by design. */
import { computePlaceNextState } from "../engine/compute-place-next-state";
import {
  copyMonteCarloFrameBuffer,
  type MonteCarloFrameBuffer,
} from "./frame-buffer";
import { getPlaceIndex } from "./layout";
import { ensureFrameCapacity } from "./run-state";

import type { EngineFrameLayout, SimulationInstance } from "../engine/types";
import type { MonteCarloRunState, PlaceID } from "./internal-types";

/**
 * Copies the current frame into the next-frame buffer and applies continuous
 * place dynamics.
 *
 * This is the first phase of a Monte Carlo step: it preserves token structure
 * while updating colored token values according to each compiled differential
 * equation.
 */
export function writeFrameAfterDynamics(
  run: MonteCarloRunState,
): MonteCarloFrameBuffer {
  const { simulation } = run;
  const { frameLayout } = simulation;
  const source = run.currentFrame;
  const target = ensureFrameCapacity(
    run,
    run.nextFrame,
    source.tokenValueCount,
  );

  copyMonteCarloFrameBuffer(source, target);

  for (const [
    placeId,
    differentialEquation,
  ] of simulation.differentialEquationFns) {
    const placeIndex = getPlaceIndex(frameLayout, placeId);
    const count = source.placeCounts[placeIndex] ?? 0;
    const dimensions = frameLayout.placeDimensions[placeIndex] ?? 0;
    const placeSize = count * dimensions;
    if (placeSize === 0) {
      continue;
    }

    const offset = source.placeOffsets[placeIndex] ?? 0;
    const currentState = source.tokenValues.slice(offset, offset + placeSize);
    const nextState = computePlaceNextState(
      currentState,
      dimensions,
      count,
      differentialEquation,
      "euler",
      simulation.dt,
    );

    target.tokenValues.set(nextState, offset);
  }

  return target;
}

/**
 * Removes fired transition input tokens from a frame in place.
 *
 * Colored places remove explicit token indices and compact the token value
 * region. Uncolored places remove only a count because they have no token value
 * storage.
 */
export function applyTokenRemovals(
  frameLayout: EngineFrameLayout,
  frame: MonteCarloFrameBuffer,
  tokensToRemove: Record<PlaceID, Set<number> | number>,
): void {
  for (const [placeId, tokenSelection] of Object.entries(tokensToRemove)) {
    const placeIndex = getPlaceIndex(frameLayout, placeId);
    const count = frame.placeCounts[placeIndex] ?? 0;
    const dimensions = frameLayout.placeDimensions[placeIndex] ?? 0;

    if (dimensions === 0) {
      if (typeof tokenSelection !== "number") {
        throw new Error(
          `Expected token count removal for uncolored place ${placeId}`,
        );
      }
      if (tokenSelection > count) {
        throw new Error(
          `Cannot remove ${tokenSelection} tokens from place ${placeId}; it only has ${count}`,
        );
      }
      continue;
    }

    if (typeof tokenSelection === "number") {
      throw new Error(`Expected token index removal set for place ${placeId}`);
    }

    for (const tokenIndex of tokenSelection) {
      if (tokenIndex < 0 || tokenIndex >= count) {
        throw new Error(
          `Invalid token index ${tokenIndex} for place ${placeId}; it has ${count} tokens`,
        );
      }
    }
  }

  let writeOffset = 0;
  for (
    let placeIndex = 0;
    placeIndex < frameLayout.placeIds.length;
    placeIndex++
  ) {
    const placeId = frameLayout.placeIds[placeIndex]!;
    const count = frame.placeCounts[placeIndex] ?? 0;
    const dimensions = frameLayout.placeDimensions[placeIndex] ?? 0;
    const oldOffset = frame.placeOffsets[placeIndex] ?? 0;
    const tokenSelection = tokensToRemove[placeId];

    frame.placeOffsets[placeIndex] = writeOffset;

    if (dimensions === 0) {
      const removedCount =
        typeof tokenSelection === "number" ? tokenSelection : 0;
      frame.placeCounts[placeIndex] = count - removedCount;
      continue;
    }

    const removedIndices =
      tokenSelection instanceof Set ? tokenSelection : new Set<number>();
    let nextCount = 0;
    for (let tokenIndex = 0; tokenIndex < count; tokenIndex++) {
      if (removedIndices.has(tokenIndex)) {
        continue;
      }

      const sourceOffset = oldOffset + tokenIndex * dimensions;
      if (writeOffset !== sourceOffset) {
        frame.tokenValues.copyWithin(
          writeOffset,
          sourceOffset,
          sourceOffset + dimensions,
        );
      }
      writeOffset += dimensions;
      nextCount++;
    }

    frame.placeCounts[placeIndex] = nextCount;
  }

  frame.tokenValueCount = writeOffset;
}

/**
 * Accumulates token additions from multiple fired transitions by output place.
 *
 * Deferring additions until all removals are applied lets one step handle
 * multiple firings without repeatedly repacking the frame.
 */
export function mergeTokenAdditions(
  target: Map<PlaceID, number[][]>,
  additions: Record<PlaceID, number[][]>,
): void {
  for (const [placeId, tokens] of Object.entries(additions)) {
    const existingTokens = target.get(placeId);
    if (existingTokens) {
      existingTokens.push(...tokens);
    } else {
      target.set(placeId, [...tokens]);
    }
  }
}

/**
 * Appends pending output tokens into the frame, resizing if needed.
 *
 * The function computes the required Float64 value count, repacks all places
 * into their new contiguous offsets, and writes added colored token values at
 * the end of each place segment.
 */
export function applyTokenAdditions(
  run: MonteCarloRunState,
  frame: MonteCarloFrameBuffer,
  tokensToAdd: ReadonlyMap<PlaceID, number[][]>,
): MonteCarloFrameBuffer {
  if (tokensToAdd.size === 0) {
    return frame;
  }

  const { frameLayout } = run.simulation;
  const additionalTokenCounts = new Uint32Array(frameLayout.placeIds.length);
  let addedTokenValueCount = 0;

  for (const [placeId, tokens] of tokensToAdd) {
    const placeIndex = getPlaceIndex(frameLayout, placeId);
    const dimensions = frameLayout.placeDimensions[placeIndex] ?? 0;
    for (const token of tokens) {
      if (token.length !== dimensions) {
        throw new Error(
          `Token dimension mismatch for place ${placeId}. Expected ${dimensions}, got ${token.length}.`,
        );
      }
    }

    additionalTokenCounts[placeIndex] =
      (additionalTokenCounts[placeIndex] ?? 0) + tokens.length;
    addedTokenValueCount += tokens.length * dimensions;
  }

  const requiredTokenValueCount = frame.tokenValueCount + addedTokenValueCount;
  const target = ensureFrameCapacity(run, frame, requiredTokenValueCount);
  const newPlaceOffsets = new Uint32Array(frameLayout.placeIds.length);
  const newPlaceCounts = new Uint32Array(frameLayout.placeIds.length);

  let offset = 0;
  for (
    let placeIndex = 0;
    placeIndex < frameLayout.placeIds.length;
    placeIndex++
  ) {
    const dimensions = frameLayout.placeDimensions[placeIndex] ?? 0;
    const count = target.placeCounts[placeIndex] ?? 0;
    const addedCount = additionalTokenCounts[placeIndex] ?? 0;
    const newCount = count + addedCount;

    newPlaceOffsets[placeIndex] = offset;
    newPlaceCounts[placeIndex] = newCount;
    offset += newCount * dimensions;
  }

  for (
    let placeIndex = frameLayout.placeIds.length - 1;
    placeIndex >= 0;
    placeIndex--
  ) {
    const placeId = frameLayout.placeIds[placeIndex]!;
    const dimensions = frameLayout.placeDimensions[placeIndex] ?? 0;
    const oldCount = target.placeCounts[placeIndex] ?? 0;
    const oldOffset = target.placeOffsets[placeIndex] ?? 0;
    const oldSize = oldCount * dimensions;
    const newOffset = newPlaceOffsets[placeIndex] ?? 0;

    if (oldSize > 0 && oldOffset !== newOffset) {
      target.tokenValues.copyWithin(newOffset, oldOffset, oldOffset + oldSize);
    }

    const addedTokens = tokensToAdd.get(placeId);
    if (addedTokens && dimensions > 0) {
      let writeOffset = newOffset + oldSize;
      for (const token of addedTokens) {
        target.tokenValues.set(token, writeOffset);
        writeOffset += dimensions;
      }
    }
  }

  target.placeOffsets.set(newPlaceOffsets);
  target.placeCounts.set(newPlaceCounts);
  target.tokenValueCount = requiredTokenValueCount;

  return target;
}

/**
 * Updates transition elapsed-time and firing-count metadata after a step.
 *
 * Fired transitions reset their elapsed timer and increment their firing count;
 * non-fired transitions advance by `dt`.
 */
export function updateTransitionTimers(
  frame: MonteCarloFrameBuffer,
  firedTransitions: ReadonlySet<string>,
  simulation: SimulationInstance,
): void {
  for (
    let index = 0;
    index < simulation.frameLayout.transitionIds.length;
    index++
  ) {
    const transitionId = simulation.frameLayout.transitionIds[index]!;
    if (firedTransitions.has(transitionId)) {
      frame.transitionElapsedFrames[index] = 0;
      frame.transitionElapsed[index] = 0;
      frame.transitionFiredFlags[index] = 1;
      frame.transitionFiringCounts[index] =
        (frame.transitionFiringCounts[index] ?? 0) + 1;
    } else {
      const elapsedFrames = (frame.transitionElapsedFrames[index] ?? 0) + 1;
      frame.transitionElapsedFrames[index] = elapsedFrames;
      frame.transitionElapsed[index] = elapsedFrames * simulation.dt;
      frame.transitionFiredFlags[index] = 0;
    }
  }
}

/**
 * Checks whether any transition is structurally enabled in the current frame.
 *
 * This is used for deadlock detection after a step where no transition fired.
 * It intentionally ignores lambda probability and only checks input-place
 * token availability and inhibitor conditions.
 */
export function hasStructurallyEnabledTransition(
  run: MonteCarloRunState,
): boolean {
  const { frameLayout } = run.simulation;
  const frame = run.currentFrame;

  for (const transition of run.simulation.compiledTransitions.values()) {
    const enabled = transition.inputPlaces.every((inputPlace) => {
      const placeIndex = getPlaceIndex(frameLayout, inputPlace.placeId);
      const count = frame.placeCounts[placeIndex] ?? 0;

      return inputPlace.arcType === "inhibitor"
        ? count < inputPlace.weight
        : count >= inputPlace.weight;
    });

    if (enabled) {
      return true;
    }
  }

  return false;
}
