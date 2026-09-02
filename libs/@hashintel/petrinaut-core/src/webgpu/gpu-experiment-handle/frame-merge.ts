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
 * Re-delivery is detected from frame numbers alone: within one delivery pass
 * they only rise, so a frame at or below the highest one seen is a re-run of
 * the time axis. That keeps the detector at one number rather than a key per
 * frame per metric for the experiment's lifetime.
 */
export const createFrameMerger = (): FrameMerger => {
  let highestFrame = 0;
  let cumulative = false;
  return {
    ingest(state, frames) {
      if (!cumulative) {
        let redelivered = false;
        for (const frame of frames) {
          if (frame.frameNumber <= highestFrame) {
            redelivered = true;
          }
          highestFrame = Math.max(highestFrame, frame.frameNumber);
        }
        if (!redelivered) {
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
