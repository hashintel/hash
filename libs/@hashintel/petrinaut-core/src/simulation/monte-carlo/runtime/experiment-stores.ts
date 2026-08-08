/**
 * Store and event plumbing shared by every experiment backend.
 *
 * Extracted from `experiment.ts` when the WebGPU backend arrived: a second
 * backend has to present the identical `MonteCarloExperiment` handle, and
 * duplicating the stores would let the two drift in ways the UI would notice
 * (a missed `Object.is` guard, say, causing render loops in one but not the
 * other).
 */
import { createUserKeyedRecord } from "../../../validation/record-keys";

import type { EventStream } from "../../../instance";
import type { ReadableStore } from "../../../store";
import type { MonteCarloUserDefinedMetricFrame } from "../metrics";

export type WritableStore<T> = ReadableStore<T> & { set(next: T): void };

export type EmittableEventStream<T> = EventStream<T> & { emit(event: T): void };

export type MonteCarloExperimentMetrics = {
  frames: readonly MonteCarloUserDefinedMetricFrame[];
  latestByMetricId: Readonly<Record<string, MonteCarloUserDefinedMetricFrame>>;
};

/**
 * A minimal observable value.
 *
 * Skips notification when the value is unchanged, because consumers subscribe
 * every store to one `sync` callback that patches React state.
 */
export function createReadableStore<T>(initial: T): WritableStore<T> {
  let current = initial;
  const listeners = new Set<(value: T) => void>();

  return {
    get: () => current,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set(next) {
      if (Object.is(next, current)) {
        return;
      }
      current = next;
      for (const listener of listeners) {
        listener(current);
      }
    },
  };
}

export function createEventStream<T>(): EmittableEventStream<T> {
  const listeners = new Set<(event: T) => void>();

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    emit(event) {
      for (const listener of listeners) {
        listener(event);
      }
    },
  };
}

export function createEmptyMetricsState(): MonteCarloExperimentMetrics {
  // Keyed by metric ids from the net definition: no prototype.
  return { frames: [], latestByMetricId: createUserKeyedRecord() };
}

/**
 * Appends frames and refreshes the per-metric latest pointer.
 *
 * `latestByMetricId` is what the UI reads for current values, so it is kept
 * alongside the flat timeline rather than derived on every render.
 */
export function appendMetricFrames(
  state: MonteCarloExperimentMetrics,
  nextFrames: readonly MonteCarloUserDefinedMetricFrame[],
): MonteCarloExperimentMetrics {
  const latestByMetricId = Object.assign(
    createUserKeyedRecord<MonteCarloUserDefinedMetricFrame>(),
    state.latestByMetricId,
  );

  for (const frame of nextFrames) {
    latestByMetricId[frame.metricId] = frame;
  }

  return {
    frames: [...state.frames, ...nextFrames],
    latestByMetricId,
  };
}
