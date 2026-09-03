import type {
  DetachedObjectiveRun,
  DetachedObjectiveRunOutcome,
  DetachedObjectiveRunRequest,
  ExperimentComputeBackend,
} from "../experiments/context";
import type {
  MonteCarloUserDefinedMetricFrame,
  MonteCarloWorkerProgress,
} from "@hashintel/petrinaut-core";

type Store<T> = {
  get(): T;
  set(value: T): void;
  subscribe(listener: (value: T) => void): () => void;
};

const createStore = <T>(initial: T): Store<T> => {
  let current = initial;
  const listeners = new Set<(value: T) => void>();
  return {
    get: () => current,
    set: (value) => {
      current = value;
      for (const listener of listeners) {
        listener(value);
      }
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
};

export type FakeDetachedObjectiveRun = {
  request: DetachedObjectiveRunRequest;
  frames: Store<readonly MonteCarloUserDefinedMetricFrame[]>;
  progress: Store<MonteCarloWorkerProgress | null>;
  run: DetachedObjectiveRun;
  cancelled: boolean;
  settle: (outcome: DetachedObjectiveRunOutcome) => void;
};

export const cancelledRunOutcome: DetachedObjectiveRunOutcome = {
  ok: false,
  cancelled: true,
  reason: "cancelled",
};

export const failedRunOutcome = (
  reason: string,
): DetachedObjectiveRunOutcome => ({ ok: false, cancelled: false, reason });

/** Records every requested run and lets the test stream into and settle each one. */
export const createFakeDetachedObjectiveRuns = () => {
  const runs: FakeDetachedObjectiveRun[] = [];
  const runDetachedObjective = (
    request: DetachedObjectiveRunRequest,
  ): DetachedObjectiveRun => {
    const frames = createStore<readonly MonteCarloUserDefinedMetricFrame[]>([]);
    const progress = createStore<MonteCarloWorkerProgress | null>(null);
    const { promise, resolve } =
      Promise.withResolvers<DetachedObjectiveRunOutcome>();
    const entry: FakeDetachedObjectiveRun = {
      request,
      frames,
      progress,
      cancelled: false,
      settle: resolve,
      run: {
        frames,
        progress,
        completion: promise,
        cancel: () => {
          entry.cancelled = true;
          resolve(cancelledRunOutcome);
        },
      },
    };
    request.signal?.addEventListener("abort", entry.run.cancel, {
      once: true,
    });
    runs.push(entry);
    return entry.run;
  };
  return { runs, runDetachedObjective };
};

export const distributionFrame = (
  metricId: string,
  frameNumber: number,
  bins: readonly (readonly [number, number])[],
): MonteCarloUserDefinedMetricFrame => ({
  metricId,
  label: metricId,
  outputType: "distribution",
  frameNumber,
  time: frameNumber,
  bins,
  value: null,
  frameValue: null,
  timeValue: null,
  runSampleCount: bins.reduce((sum, [, frequency]) => sum + frequency, 0),
  timeSampleCount: 0,
});

/** A finished batch: `runValues` are the per-run finals the CPU pool reports; none for the GPU. */
export const completedRunResult = ({
  metricId,
  frames,
  runValues = [],
  runsCompleted = runValues.length,
  computeBackend = "cpu",
  fallbackReason = null,
}: {
  metricId: string;
  frames: readonly MonteCarloUserDefinedMetricFrame[];
  runValues?: readonly number[];
  runsCompleted?: number;
  computeBackend?: ExperimentComputeBackend;
  fallbackReason?: string | null;
}): Extract<DetachedObjectiveRunOutcome, { ok: true }> => ({
  ok: true,
  runsCompleted,
  metricFrames: frames,
  runResults: new Map(
    runValues.map((value, runIndex) => [runIndex, { [metricId]: value }]),
  ),
  computeBackend,
  computeBackendFallbackReason: fallbackReason,
});
