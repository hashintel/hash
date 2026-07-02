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
  const target = ensureFrameCapacity(run, run.nextFrame, source.tokenByteCount);

  copyMonteCarloFrameBuffer(source, target);

  for (const [
    placeId,
    differentialEquation,
  ] of simulation.differentialEquationFns) {
    const placeIndex = getPlaceIndex(frameLayout, placeId);
    const count = source.placeCounts[placeIndex] ?? 0;
    const strideBytes = frameLayout.placeStrideBytes[placeIndex] ?? 0;
    const tokenLayout = frameLayout.placeTokenLayouts[placeIndex];
    const placeByteSize = count * strideBytes;
    if (placeByteSize === 0 || !tokenLayout) {
      continue;
    }

    const byteOffset = source.placeOffsets[placeIndex] ?? 0;
    // `.slice` copies into a fresh, 8-aligned buffer.
    const currentState = source.tokenBytes.slice(
      byteOffset,
      byteOffset + placeByteSize,
    );
    const nextState = computePlaceNextState(
      currentState,
      tokenLayout,
      count,
      differentialEquation,
      "euler",
      simulation.dt,
    );

    target.tokenBytes.set(nextState, byteOffset);
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
    const strideBytes = frameLayout.placeStrideBytes[placeIndex] ?? 0;

    if (strideBytes === 0) {
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

  let writeByteOffset = 0;
  for (
    let placeIndex = 0;
    placeIndex < frameLayout.placeIds.length;
    placeIndex++
  ) {
    const placeId = frameLayout.placeIds[placeIndex]!;
    const count = frame.placeCounts[placeIndex] ?? 0;
    const strideBytes = frameLayout.placeStrideBytes[placeIndex] ?? 0;
    const oldByteOffset = frame.placeOffsets[placeIndex] ?? 0;
    const tokenSelection = tokensToRemove[placeId];

    frame.placeOffsets[placeIndex] = writeByteOffset;

    if (strideBytes === 0) {
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

      const sourceByteOffset = oldByteOffset + tokenIndex * strideBytes;
      if (writeByteOffset !== sourceByteOffset) {
        frame.tokenBytes.copyWithin(
          writeByteOffset,
          sourceByteOffset,
          sourceByteOffset + strideBytes,
        );
      }
      writeByteOffset += strideBytes;
      nextCount++;
    }

    frame.placeCounts[placeIndex] = nextCount;
  }

  frame.tokenByteCount = writeByteOffset;
}

/**
 * Accumulates token additions from multiple fired transitions by output place.
 *
 * Deferring additions until all removals are applied lets one step handle
 * multiple firings without repeatedly repacking the frame.
 */
export function mergeTokenAdditions(
  target: Map<PlaceID, Uint8Array[]>,
  additions: Record<PlaceID, Uint8Array[]>,
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
 * The function computes the required token byte count, repacks all places
 * into their new contiguous byte offsets, and writes added colored token byte
 * blocks at the end of each place segment.
 */
export function applyTokenAdditions(
  run: MonteCarloRunState,
  frame: MonteCarloFrameBuffer,
  tokensToAdd: ReadonlyMap<PlaceID, Uint8Array[]>,
): MonteCarloFrameBuffer {
  if (tokensToAdd.size === 0) {
    return frame;
  }

  const { frameLayout } = run.simulation;
  const additionalTokenCounts = new Uint32Array(frameLayout.placeIds.length);
  let addedTokenByteCount = 0;

  for (const [placeId, tokens] of tokensToAdd) {
    const placeIndex = getPlaceIndex(frameLayout, placeId);
    const strideBytes = frameLayout.placeStrideBytes[placeIndex] ?? 0;
    for (const token of tokens) {
      if (token.byteLength !== strideBytes) {
        throw new Error(
          `Token byte size mismatch for place ${placeId}. Expected ${strideBytes}, got ${token.byteLength}.`,
        );
      }
    }

    additionalTokenCounts[placeIndex] =
      (additionalTokenCounts[placeIndex] ?? 0) + tokens.length;
    addedTokenByteCount += tokens.length * strideBytes;
  }

  const requiredTokenByteCount = frame.tokenByteCount + addedTokenByteCount;
  const target = ensureFrameCapacity(run, frame, requiredTokenByteCount);
  const newPlaceOffsets = new Uint32Array(frameLayout.placeIds.length);
  const newPlaceCounts = new Uint32Array(frameLayout.placeIds.length);

  let byteOffset = 0;
  for (
    let placeIndex = 0;
    placeIndex < frameLayout.placeIds.length;
    placeIndex++
  ) {
    const strideBytes = frameLayout.placeStrideBytes[placeIndex] ?? 0;
    const count = target.placeCounts[placeIndex] ?? 0;
    const addedCount = additionalTokenCounts[placeIndex] ?? 0;
    const newCount = count + addedCount;

    newPlaceOffsets[placeIndex] = byteOffset;
    newPlaceCounts[placeIndex] = newCount;
    byteOffset += newCount * strideBytes;
  }

  for (
    let placeIndex = frameLayout.placeIds.length - 1;
    placeIndex >= 0;
    placeIndex--
  ) {
    const placeId = frameLayout.placeIds[placeIndex]!;
    const strideBytes = frameLayout.placeStrideBytes[placeIndex] ?? 0;
    const oldCount = target.placeCounts[placeIndex] ?? 0;
    const oldByteOffset = target.placeOffsets[placeIndex] ?? 0;
    const oldByteSize = oldCount * strideBytes;
    const newByteOffset = newPlaceOffsets[placeIndex] ?? 0;

    if (oldByteSize > 0 && oldByteOffset !== newByteOffset) {
      target.tokenBytes.copyWithin(
        newByteOffset,
        oldByteOffset,
        oldByteOffset + oldByteSize,
      );
    }

    const addedTokens = tokensToAdd.get(placeId);
    if (addedTokens && strideBytes > 0) {
      let writeByteOffset = newByteOffset + oldByteSize;
      for (const token of addedTokens) {
        target.tokenBytes.set(token, writeByteOffset);
        writeByteOffset += strideBytes;
      }
    }
  }

  target.placeOffsets.set(newPlaceOffsets);
  target.placeCounts.set(newPlaceCounts);
  target.tokenByteCount = requiredTokenByteCount;

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
 * token availability, read-arc availability, and inhibitor conditions.
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
