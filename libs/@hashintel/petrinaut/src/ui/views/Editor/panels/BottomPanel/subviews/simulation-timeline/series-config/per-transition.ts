import { DEFAULT_COLORS } from "../default-colors";

import type { TimelineSeriesConfig } from "../types";
import type { Transition } from "@hashintel/petrinaut-core";

const PER_TRANSITION_WINDOW_SEC = 4;
const OUTPUT_EWMA_ALPHA = 0.15;

/**
 * Builds the per-transition firing timeline view.
 *
 * Each transition becomes one series. The extractor tracks cumulative firing
 * counts over time and returns a smoothed trailing-window firing delta so the
 * chart is readable even when transition firings are bursty.
 */
export function buildPerTransitionSeriesConfig(args: {
  transitions: Transition[];
}): TimelineSeriesConfig {
  const { transitions } = args;
  const transitionIds = transitions.map((transition) => transition.id);

  const timeHistory: number[] = [];
  const cumulativeHistories: number[][] = transitions.map(() => []);
  const lastFiringTimes: (number | null)[] = transitions.map(() => null);
  const lastIntervals: (number | null)[] = transitions.map(() => null);
  const prevFiringCounts: number[] = transitions.map(() => 0);
  const smoothedOutputs: number[] = transitions.map(() => 0);

  const resetState = () => {
    timeHistory.length = 0;
    for (const history of cumulativeHistories) {
      history.length = 0;
    }
    for (let i = 0; i < transitions.length; i++) {
      lastFiringTimes[i] = null;
      lastIntervals[i] = null;
      prevFiringCounts[i] = 0;
      smoothedOutputs[i] = 0;
    }
  };

  return {
    series: transitions.map((transition, index) => ({
      seriesId: `transition__${transition.id}`,
      seriesName: transition.name,
      color: DEFAULT_COLORS[index % DEFAULT_COLORS.length]!,
    })),
    extract: (frame, seriesIdx, time) => {
      const id = transitionIds[seriesIdx];
      if (!id) {
        return 0;
      }

      if (seriesIdx === 0) {
        const last = timeHistory[timeHistory.length - 1];
        if (last !== undefined && time < last) {
          resetState();
        }
        timeHistory.push(time);
      }

      const transitionState = frame.getTransitionState(id);
      const firingCount = transitionState?.firingCount ?? 0;
      const tslSec = (transitionState?.timeSinceLastFiringMs ?? 0) / 1000;

      if (firingCount > prevFiringCounts[seriesIdx]!) {
        const prevFiringTime = lastFiringTimes[seriesIdx] ?? null;
        if (prevFiringTime !== null) {
          const interval = time - prevFiringTime;
          if (interval > 0) {
            lastIntervals[seriesIdx] = interval;
          }
        }
        lastFiringTimes[seriesIdx] = time;
      }
      prevFiringCounts[seriesIdx] = firingCount;

      const interval = lastIntervals[seriesIdx] ?? null;
      const interpolated =
        interval !== null && interval > 0
          ? firingCount + Math.min(1, tslSec / interval)
          : firingCount;

      cumulativeHistories[seriesIdx]!.push(interpolated);

      const targetTime = time - PER_TRANSITION_WINDOW_SEC;
      const history = cumulativeHistories[seriesIdx]!;
      let prev = 0;
      for (let i = timeHistory.length - 2; i >= 0; i--) {
        if (timeHistory[i]! <= targetTime) {
          prev = history[i]!;
          break;
        }
      }

      const rawDelta = interpolated - prev;
      const smoothed =
        OUTPUT_EWMA_ALPHA * rawDelta +
        (1 - OUTPUT_EWMA_ALPHA) * smoothedOutputs[seriesIdx]!;
      smoothedOutputs[seriesIdx] = smoothed;
      return smoothed;
    },
  };
}
