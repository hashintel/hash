/**
 * Folding streamed histogram frames into the metrics store.
 *
 * A single-tile experiment delivers each frame once, in ascending order, and
 * keeps the cheap append. A tiled experiment (and a probe followed by the
 * full run) re-delivers earlier frame numbers with cumulative bins, which an
 * append would duplicate: the first re-delivery flips to merging each chunk
 * into the store by key, latest delivery winning.
 */
import {
  appendMetricFrames,
  createEmptyMetricsState,
} from "../../simulation/monte-carlo/runtime/experiment-stores";

import type { MonteCarloUserDefinedMetricFrame } from "../../simulation/monte-carlo/metrics";
import type { MonteCarloExperimentMetrics } from "../../simulation/monte-carlo/runtime/experiment-stores";

export type FrameMerger = {
  /** The store's state after folding in one chunk's frames. */
  ingest: (
    state: MonteCarloExperimentMetrics,
    frames: readonly MonteCarloUserDefinedMetricFrame[],
  ) => MonteCarloExperimentMetrics;
};

/** A separator no metric id contains. */
const KEY_SEPARATOR = String.fromCharCode(0);

const frameKey = (frame: { metricId: string; frameNumber: number }) =>
  `${frame.metricId}${KEY_SEPARATOR}${frame.frameNumber}`;

/**
 * Re-delivery is detected from frame numbers alone: across chunks they only
 * rise, so a chunk holding a frame at or below the previous chunks' highest
 * is a re-run of the time axis. Within one chunk every metric shares the same
 * frame numbers, so the mark advances only once the whole chunk is scanned.
 */
export const advanceHighWaterMark = (
  highestSoFar: number,
  frames: readonly { frameNumber: number }[],
): { redelivered: boolean; highest: number } => {
  let redelivered = false;
  let highest = highestSoFar;
  for (const frame of frames) {
    if (frame.frameNumber <= highestSoFar) {
      redelivered = true;
    }
    highest = Math.max(highest, frame.frameNumber);
  }
  return { redelivered, highest };
};

export const createFrameMerger = (): FrameMerger => {
  let highestFrame = 0;
  let cumulative = false;
  return {
    ingest(state, frames) {
      if (!cumulative) {
        const mark = advanceHighWaterMark(highestFrame, frames);
        highestFrame = mark.highest;
        if (!mark.redelivered) {
          return appendMetricFrames(state, frames);
        }
        cumulative = true;
      }
      // Merge at the store level: it already holds every earlier delivery, so
      // replacing by key needs no second copy of the histogram data.
      const merged = new Map(
        state.frames.map((frame) => [frameKey(frame), frame]),
      );
      for (const frame of frames) {
        merged.set(frameKey(frame), frame);
      }
      return appendMetricFrames(createEmptyMetricsState(), [
        ...merged.values(),
      ]);
    },
  };
};
