import { createEngineFrame } from "../../frames/internal-frame";

import type {
  EngineFrame,
  EngineFrameLayout,
  EngineFrameSnapshot,
} from "../../frames/internal-frame";
import type { MonteCarloFrameBuffer } from "../../monte-carlo/frame-buffer";
import type { MonteCarloRunState } from "../../monte-carlo/internal-types";

/** The engine frame format of a Monte Carlo run's frame. */
export const engineFrameFromRunFrame = (
  layout: EngineFrameLayout,
  frame: MonteCarloFrameBuffer,
): EngineFrame => {
  const places: EngineFrameSnapshot["places"] = {};
  for (const [index, placeId] of layout.placeIds.entries()) {
    places[placeId] = {
      byteOffset: frame.placeOffsets[index] ?? 0,
      count: frame.placeCounts[index] ?? 0,
      strideBytes: layout.placeStrideBytes[index] ?? 0,
    };
  }
  const transitions: EngineFrameSnapshot["transitions"] = {};
  for (const [index, transitionId] of layout.transitionIds.entries()) {
    transitions[transitionId] = {
      timeSinceLastFiringMs: frame.transitionElapsed[index] ?? 0,
      firedInThisFrame: frame.transitionFiredFlags[index] === 1,
      firingCount: frame.transitionFiringCounts[index] ?? 0,
    };
  }
  return createEngineFrame(layout, {
    places,
    transitions,
    buffer: frame.tokenBytes.subarray(0, frame.tokenByteCount),
  });
};

/** The frame place indices the firings of `transitionIds` consumed from or produced into. */
export const touchedPlaceIndices = (
  run: MonteCarloRunState,
  transitionIds: readonly string[],
): Uint32Array => {
  const { placeIndexById } = run.simulation.frameLayout;
  const touched = new Set<number>();
  for (const transitionId of transitionIds) {
    const transition = run.simulation.compiledTransitions.get(transitionId);
    if (!transition) {
      continue;
    }
    for (const input of transition.inputPlaces) {
      if (input.arcType === "standard") {
        touched.add(placeIndexById.get(input.placeId)!);
      }
    }
    for (const output of transition.outputPlaces) {
      touched.add(placeIndexById.get(output.placeId)!);
    }
  }
  return Uint32Array.from(touched).sort();
};
