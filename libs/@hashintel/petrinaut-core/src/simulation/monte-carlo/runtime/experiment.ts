import { DEFAULT_PETRINAUT_EXTENSIONS } from "../../../extensions";
import { resolveNetParameterValues } from "../../../parameter-values";
import { createUserKeyedRecord } from "../../../validation/record-keys";
import { createWorkerTransport } from "../../runtime/transport";
import {
  createMonteCarloMetricShardMerger,
  createMonteCarloUserDefinedMetricConfigsFromSpecs,
  createMonteCarloUserDefinedMetric,
} from "../metrics";
import { createMonteCarloSimulator } from "../monte-carlo-simulator";
import {
  getDefaultMonteCarloShardCount,
  planMonteCarloShards,
} from "./shard-plan";

import type { AbortSignalLike } from "../../../environment";
import type { PetrinautExtensionSettings } from "../../../extensions";
import type { HirArtifacts } from "../../../hir-runtime";
import type { EventStream } from "../../../instance";
import type { ReadableStore } from "../../../store";
import type { SDCPN } from "../../../types/sdcpn";
import type {
  InitialMarking,
  SimulationTransport,
  WorkerFactory,
} from "../../api";
import type {
  MonteCarloMetricSpec,
  MonteCarloUserDefinedMetric,
  MonteCarloUserDefinedMetricConfig,
  MonteCarloUserDefinedMetricFrame,
} from "../metrics";
import type { MonteCarloAdvanceResult, MonteCarloSimulator } from "../types";
import type {
  MonteCarloToMainMessage,
  MonteCarloWorkerProgress,
} from "../worker/messages";
import type { MonteCarloShardPlanEntry } from "./shard-plan";

export type MonteCarloExperimentState =
  | "Initializing"
  | "Ready"
  | "Running"
  | "Complete"
  | "Error"
  | "Cancelled";

export type MonteCarloExperimentMetrics = {
  frames: readonly MonteCarloUserDefinedMetricFrame[];
  latestByMetricId: Readonly<Record<string, MonteCarloUserDefinedMetricFrame>>;
};

export type MonteCarloExperimentEvent =
  | { type: "complete"; progress: MonteCarloWorkerProgress }
  | { type: "cancelled"; progress: MonteCarloWorkerProgress | null }
  | { type: "error"; message: string; itemId: string | null };

type CreateMonteCarloExperimentBaseConfig = {
  sdcpn: SDCPN;
  extensions?: PetrinautExtensionSettings;
  initialMarking: InitialMarking;
  parameterValues: Record<string, string>;
  seed: number;
  dt: number;
  maxTime: number;
  /** Precompiled HIR artifacts (`compileHirArtifacts`) — required for any
   * dynamics/lambda/kernel user code in the net. */
  hirArtifacts?: HirArtifacts;
  runCount: number;
  batchSize?: number;
  /**
   * How many workers to split the runs across.
   *
   * Defaults to one per logical core minus one (capped at `runCount`). Runs are
   * independent and seeds derive from the global run index, so shard count
   * changes only how fast an experiment finishes, never what it reports. Only
   * honoured for `createWorker` experiments — a caller-supplied `transport` is a
   * single channel and always runs as one shard.
   */
  shardCount?: number;
  signal?: AbortSignalLike;
};

export type CreateMonteCarloExperimentConfig =
  CreateMonteCarloExperimentBaseConfig &
    (
      | {
          createWorker: WorkerFactory;
          transport?: never;
          metrics?: never;
          metricSpecs?: readonly MonteCarloMetricSpec[];
        }
      | {
          transport: SimulationTransport;
          createWorker?: never;
          metrics?: never;
          metricSpecs?: readonly MonteCarloMetricSpec[];
        }
      | {
          metrics: readonly MonteCarloUserDefinedMetricConfig[];
          createWorker?: never;
          transport?: never;
          metricSpecs?: never;
        }
      | {
          metricSpecs: readonly MonteCarloMetricSpec[];
          createWorker?: never;
          transport?: never;
          metrics?: never;
        }
    );

export interface MonteCarloExperiment {
  readonly status: ReadableStore<MonteCarloExperimentState>;
  readonly progress: ReadableStore<MonteCarloWorkerProgress | null>;
  readonly metrics: ReadableStore<MonteCarloExperimentMetrics>;
  readonly events: EventStream<MonteCarloExperimentEvent>;

  start(this: void): void;
  cancel(this: void): void;
  dispose(this: void): void;
}

function createReadableStore<T>(initial: T): ReadableStore<T> & {
  set(next: T): void;
} {
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

function createEventStream<T>(): EventStream<T> & { emit(event: T): void } {
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

function delay(): Promise<void> {
  const runtime = globalThis as {
    setTimeout?: (handler: () => void, timeout?: number) => unknown;
  };

  return runtime.setTimeout
    ? new Promise((resolve) => {
        runtime.setTimeout!(() => resolve(undefined), 0);
      })
    : Promise.resolve();
}

function createEmptyMetricsState(): MonteCarloExperimentMetrics {
  return {
    frames: [],
    latestByMetricId: {},
  };
}

function appendMetricFrames(
  state: MonteCarloExperimentMetrics,
  nextFrames: readonly MonteCarloUserDefinedMetricFrame[],
): MonteCarloExperimentMetrics {
  // Keyed by metric ids from the net definition: no prototype.
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

function takePendingMetricFrames(
  metrics: readonly MonteCarloUserDefinedMetric[],
  lastFrameCounts: Map<string, number>,
): MonteCarloUserDefinedMetricFrame[] {
  return metrics.flatMap((metric) => {
    const lastFrameCount = lastFrameCounts.get(metric.id) ?? 0;
    lastFrameCounts.set(metric.id, metric.frames.length);

    return metric.frames.slice(lastFrameCount);
  });
}

function getLatestMetricFrame(
  metrics: readonly MonteCarloUserDefinedMetric[],
): MonteCarloUserDefinedMetricFrame | null {
  let latest: MonteCarloUserDefinedMetricFrame | null = null;

  for (const metric of metrics) {
    const frame = metric.getLatestFrame();
    if (!frame) {
      continue;
    }

    if (
      !latest ||
      frame.frameNumber > latest.frameNumber ||
      (frame.frameNumber === latest.frameNumber && frame.time > latest.time)
    ) {
      latest = frame;
    }
  }

  return latest;
}

function getProgressPosition(
  simulator: MonteCarloSimulator,
  metrics: readonly MonteCarloUserDefinedMetric[],
): Pick<MonteCarloWorkerProgress, "frameNumber" | "time"> {
  const latestMetricFrame = getLatestMetricFrame(metrics);
  if (latestMetricFrame) {
    return {
      frameNumber: latestMetricFrame.frameNumber,
      time: latestMetricFrame.time,
    };
  }

  let frameNumber = 0;
  let time = 0;

  for (const summary of simulator.getSummaries()) {
    if (summary.frameNumber > frameNumber) {
      frameNumber = summary.frameNumber;
      time = summary.currentTime;
    }
  }

  return {
    frameNumber,
    time,
  };
}

function getProgressFromResult(
  result: MonteCarloAdvanceResult,
  simulator: MonteCarloSimulator,
  metrics: readonly MonteCarloUserDefinedMetric[],
): MonteCarloWorkerProgress {
  const position = getProgressPosition(simulator, metrics);

  return {
    ...result,
    frameNumber: position.frameNumber,
    time: position.time,
    runCount: simulator.runCount,
  };
}

function getInitialProgress(
  simulator: MonteCarloSimulator,
  metrics: readonly MonteCarloUserDefinedMetric[],
): MonteCarloWorkerProgress {
  const summaries = simulator.getSummaries();
  const position = getProgressPosition(simulator, metrics);
  const activeRuns = summaries.filter(
    (summary) => summary.status !== "complete" && summary.status !== "error",
  ).length;
  const completedRuns = summaries.filter(
    (summary) => summary.status === "complete",
  ).length;
  const erroredRuns = summaries.filter(
    (summary) => summary.status === "error",
  ).length;

  return {
    activeRuns,
    advancedRuns: 0,
    allFinished: false,
    completedRuns,
    erroredRuns,
    frameNumber: position.frameNumber,
    runCount: simulator.runCount,
    time: position.time,
  };
}

function createLocalMonteCarloExperiment(
  config: CreateMonteCarloExperimentBaseConfig & {
    metrics: readonly MonteCarloUserDefinedMetricConfig[];
  },
): Promise<MonteCarloExperiment> {
  const status = createReadableStore<MonteCarloExperimentState>("Initializing");
  const progress = createReadableStore<MonteCarloWorkerProgress | null>(null);
  const metrics = createReadableStore<MonteCarloExperimentMetrics>(
    createEmptyMetricsState(),
  );
  const events = createEventStream<MonteCarloExperimentEvent>();
  let disposed = false;
  let running = false;
  let abortListener: (() => void) | null = null;

  try {
    const userMetrics = config.metrics.map((metricConfig) =>
      createMonteCarloUserDefinedMetric(metricConfig),
    );
    const lastMetricFrameCounts = new Map<string, number>();
    const simulator = createMonteCarloSimulator({
      sdcpn: config.sdcpn,
      extensions: config.extensions,
      initialMarking: config.initialMarking,
      parameterValues: config.parameterValues,
      seed: config.seed,
      dt: config.dt,
      maxTime: config.maxTime,
      hirArtifacts: config.hirArtifacts,
      runCount: config.runCount,
      metrics: userMetrics,
    });

    const syncStores = (nextProgress: MonteCarloWorkerProgress | null) => {
      const nextMetricFrames = takePendingMetricFrames(
        userMetrics,
        lastMetricFrameCounts,
      );
      if (nextMetricFrames.length > 0) {
        metrics.set(appendMetricFrames(metrics.get(), nextMetricFrames));
      }
      if (nextProgress) {
        progress.set(nextProgress);
      }
    };
    const isStopped = () => !running || disposed;

    const cancel = () => {
      if (disposed || !running) {
        return;
      }

      running = false;
      const latestProgress = progress.get();
      status.set("Cancelled");
      events.emit({ type: "cancelled", progress: latestProgress });
    };

    const dispose = () => {
      if (disposed) {
        return;
      }

      disposed = true;
      running = false;
      if (abortListener) {
        config.signal?.removeEventListener("abort", abortListener);
        abortListener = null;
      }
    };

    const runLoop = async () => {
      while (running && !disposed) {
        let result: MonteCarloAdvanceResult | null = null;
        for (let index = 0; index < (config.batchSize ?? 4); index++) {
          result = simulator.advanceAll();
          if (result.allFinished) {
            break;
          }
        }

        if (result) {
          const nextProgress = getProgressFromResult(
            result,
            simulator,
            userMetrics,
          );
          syncStores(nextProgress);

          if (isStopped()) {
            return;
          }

          if (result.allFinished) {
            running = false;
            status.set("Complete");
            events.emit({ type: "complete", progress: nextProgress });
            return;
          }
        }

        await delay();
      }
    };

    const handle: MonteCarloExperiment = {
      status,
      progress,
      metrics,
      events,
      start() {
        if (disposed || running) {
          return;
        }

        running = true;
        status.set("Running");
        void runLoop().catch((error: unknown) => {
          running = false;
          status.set("Error");
          events.emit({
            type: "error",
            message:
              error instanceof Error
                ? error.message
                : "Unknown error during Monte Carlo computation",
            itemId: null,
          });
        });
      },
      cancel,
      dispose,
    };

    abortListener = () => {
      cancel();
      dispose();
    };

    if (config.signal) {
      if (config.signal.aborted) {
        const error = new Error("Monte Carlo experiment start aborted");
        error.name = "AbortError";
        return Promise.reject(error);
      }
      config.signal.addEventListener("abort", abortListener, { once: true });
    }

    const initialProgress = getInitialProgress(simulator, userMetrics);
    syncStores(initialProgress);
    status.set("Ready");

    return Promise.resolve(handle);
  } catch (error) {
    status.set("Error");
    return Promise.reject(
      error instanceof Error
        ? error
        : new Error("Failed to initialize Monte Carlo experiment"),
    );
  }
}

/**
 * Creates a Monte Carlo experiment handle for app/runtime use.
 *
 * The returned handle exposes status, progress, streamed metric frames,
 * lifecycle events, start/cancel controls, and cleanup around the core Monte
 * Carlo simulator. Worker-backed experiments use a transport; metric specs are
 * sent to the worker while executable metric callback configs run locally.
 */
export function createMonteCarloExperiment(
  config: CreateMonteCarloExperimentConfig,
): Promise<MonteCarloExperiment> {
  if ("metrics" in config && config.metrics !== undefined) {
    return createLocalMonteCarloExperiment(config);
  }

  if (
    "metricSpecs" in config &&
    config.metricSpecs !== undefined &&
    !("createWorker" in config) &&
    !("transport" in config)
  ) {
    const { metricSpecs, ...baseConfig } = config;

    return createLocalMonteCarloExperiment({
      ...baseConfig,
      metrics: createMonteCarloUserDefinedMetricConfigsFromSpecs(
        metricSpecs,
        config.sdcpn,
        resolveNetParameterValues(
          config.sdcpn.parameters,
          config.parameterValues,
          (config.extensions ?? DEFAULT_PETRINAUT_EXTENSIONS).parameters,
        ),
      ),
    });
  }

  // A caller-supplied transport is a single channel, so it cannot be sharded.
  // `createWorker` can be called once per shard.
  let shards: MonteCarloShardPlanEntry[];
  let transports: SimulationTransport[];
  if ("transport" in config && config.transport !== undefined) {
    shards = [{ runIndexOffset: 0, runCount: config.runCount }];
    transports = [config.transport];
  } else if ("createWorker" in config && config.createWorker !== undefined) {
    const { createWorker } = config;
    try {
      shards = planMonteCarloShards(
        config.runCount,
        config.shardCount ?? getDefaultMonteCarloShardCount(config.runCount),
      );
    } catch (error) {
      return Promise.reject(
        error instanceof Error
          ? error
          : new Error("Failed to plan Monte Carlo experiment shards"),
      );
    }
    transports = shards.map(() => createWorkerTransport(createWorker));
  } else {
    return Promise.reject(
      new Error(
        "Monte Carlo experiment requires a worker, transport, metrics, or local metric specs",
      ),
    );
  }

  const shardCount = shards.length;
  const status = createReadableStore<MonteCarloExperimentState>("Initializing");
  const progress = createReadableStore<MonteCarloWorkerProgress | null>(null);
  const metrics = createReadableStore<MonteCarloExperimentMetrics>(
    createEmptyMetricsState(),
  );
  const events = createEventStream<MonteCarloExperimentEvent>();
  let disposed = false;

  return new Promise<MonteCarloExperiment>((resolve, reject) => {
    let settled = false;
    let offListeners: (() => void)[] = [];
    let abortListener: (() => void) | null = null;

    const merger = createMonteCarloMetricShardMerger(shardCount);
    const shardProgress = new Array<MonteCarloWorkerProgress | null>(
      shardCount,
    ).fill(null);
    const shardReady = new Array<boolean>(shardCount).fill(false);
    const shardSettled = new Array<boolean>(shardCount).fill(false);
    /** Shards that will produce no further metric frames, for any reason. */
    const shardFinished = new Array<boolean>(shardCount).fill(false);
    /**
     * Shards whose runs all reached a terminal state.
     *
     * Distinct from `shardFinished`: a cancelled shard stops reporting but its
     * runs were abandoned, not finished, so it must not make the experiment
     * claim `allFinished`.
     */
    const shardCompleted = new Array<boolean>(shardCount).fill(false);

    const publishMetricFrames = (
      frames: readonly MonteCarloUserDefinedMetricFrame[],
    ) => {
      if (frames.length > 0) {
        metrics.set(appendMetricFrames(metrics.get(), frames));
      }
    };

    /**
     * Combines shard progress into one experiment-level view.
     *
     * Run tallies sum. Frame position reports the slowest shard still running,
     * because that is how far the *merged* metric timeline actually extends —
     * reporting the fastest shard would run the progress bar ahead of the data
     * behind it.
     */
    const publishProgress = () => {
      let advancedRuns = 0;
      let completedRuns = 0;
      let erroredRuns = 0;
      let activeRuns = 0;
      let slowestFrameNumber = Number.POSITIVE_INFINITY;
      let slowestTime = Number.POSITIVE_INFINITY;
      let furthestFrameNumber = 0;
      let furthestTime = 0;
      let reported = false;

      for (let shard = 0; shard < shardCount; shard++) {
        const current = shardProgress[shard];
        if (!current) {
          continue;
        }

        reported = true;
        advancedRuns += current.advancedRuns;
        completedRuns += current.completedRuns;
        erroredRuns += current.erroredRuns;
        activeRuns += current.activeRuns;
        furthestFrameNumber = Math.max(
          furthestFrameNumber,
          current.frameNumber,
        );
        furthestTime = Math.max(furthestTime, current.time);

        if (!shardFinished[shard]) {
          slowestFrameNumber = Math.min(
            slowestFrameNumber,
            current.frameNumber,
          );
          slowestTime = Math.min(slowestTime, current.time);
        }
      }

      if (!reported) {
        return;
      }

      const stillReporting = !shardFinished.every(Boolean);

      progress.set({
        advancedRuns,
        completedRuns,
        erroredRuns,
        activeRuns,
        allFinished: shardCompleted.every(Boolean),
        runCount: config.runCount,
        frameNumber: stillReporting ? slowestFrameNumber : furthestFrameNumber,
        time: stillReporting ? slowestTime : furthestTime,
      });
    };

    const cleanupTransports = ({ sendCancel }: { sendCancel: boolean }) => {
      if (disposed) {
        return;
      }

      disposed = true;
      if (abortListener) {
        config.signal?.removeEventListener("abort", abortListener);
        abortListener = null;
      }
      for (const off of offListeners) {
        off();
      }
      offListeners = [];

      for (const transport of transports) {
        if (sendCancel) {
          try {
            transport.send({ type: "cancel" });
          } catch {
            // Transport may already be torn down.
          }
        }
        transport.terminate();
      }
    };

    const rejectBeforeReady = (error: Error) => {
      if (settled) {
        return;
      }

      settled = true;
      cleanupTransports({ sendCancel: false });
      reject(error);
    };

    const onAbort = () => {
      if (!settled) {
        settled = true;
        const error = new Error("Monte Carlo experiment start aborted");
        error.name = "AbortError";
        reject(error);
      }
      cleanupTransports({ sendCancel: true });
    };

    abortListener = onAbort;

    const handle: MonteCarloExperiment = {
      status,
      progress,
      metrics,
      events,
      start() {
        if (disposed) {
          return;
        }
        status.set("Running");
        for (const transport of transports) {
          transport.send({ type: "start" });
        }
      },
      cancel() {
        if (disposed) {
          return;
        }
        for (const transport of transports) {
          transport.send({ type: "cancel" });
        }
      },
      dispose() {
        cleanupTransports({ sendCancel: true });
      },
    };

    /**
     * Marks a shard as done and, once every shard is, emits the terminal event.
     *
     * The experiment is only complete when all shards complete; a single
     * cancellation or error is terminal for the whole experiment, matching the
     * single-worker contract.
     */
    const settleShard = (
      shardIndex: number,
      outcome: "complete" | "cancelled",
    ) => {
      if (shardSettled[shardIndex]) {
        return;
      }
      shardSettled[shardIndex] = true;
      shardFinished[shardIndex] = true;
      shardCompleted[shardIndex] = outcome === "complete";
      publishMetricFrames(merger.finishShard(shardIndex));

      if (outcome === "cancelled") {
        // One shard cancelling cancels the experiment; stop the rest so they
        // do not keep burning cores on results nobody will read.
        for (const transport of transports) {
          try {
            transport.send({ type: "cancel" });
          } catch {
            // Transport may already be torn down.
          }
        }
        publishProgress();
        status.set("Cancelled");
        events.emit({ type: "cancelled", progress: progress.get() });
        return;
      }

      publishProgress();

      if (shardSettled.every(Boolean)) {
        // Nothing should be left buffered, but flush so a shard that stopped
        // mid-frame cannot silently strand its last frames.
        publishMetricFrames(merger.flush());
        const finalProgress = progress.get();
        status.set("Complete");
        events.emit({
          type: "complete",
          progress: finalProgress ?? {
            advancedRuns: 0,
            completedRuns: 0,
            erroredRuns: 0,
            activeRuns: 0,
            allFinished: true,
            runCount: config.runCount,
            frameNumber: 0,
            time: 0,
          },
        });
      }
    };

    offListeners = transports.map((transport, shardIndex) =>
      transport.onMessage((rawMessage) => {
        const message = rawMessage as MonteCarloToMainMessage;

        switch (message.type) {
          case "ready": {
            shardReady[shardIndex] = true;
            if (shardReady.every(Boolean)) {
              status.set("Ready");
              if (!settled) {
                settled = true;
                resolve(handle);
              }
            }
            break;
          }
          case "metricFrames": {
            publishMetricFrames(merger.accept(shardIndex, message.frames));
            break;
          }
          case "progress":
            shardProgress[shardIndex] = message.progress;
            publishProgress();
            break;
          case "complete":
            shardProgress[shardIndex] = message.progress;
            settleShard(shardIndex, "complete");
            break;
          case "cancelled":
            if (message.progress) {
              shardProgress[shardIndex] = message.progress;
            }
            settleShard(shardIndex, "cancelled");
            break;
          case "error":
            status.set("Error");
            events.emit({
              type: "error",
              message: message.message,
              itemId: message.itemId,
            });
            if (settled) {
              // Already handed the caller a handle, so surface the error as an
              // event and tear the remaining shards down.
              cleanupTransports({ sendCancel: true });
            } else {
              rejectBeforeReady(new Error(message.message));
            }
            break;
        }
      }),
    );

    if (config.signal) {
      if (config.signal.aborted) {
        onAbort();
        return;
      }
      config.signal.addEventListener("abort", onAbort, { once: true });
    }

    try {
      for (const [shardIndex, transport] of transports.entries()) {
        const shard = shards[shardIndex]!;
        transport.send({
          type: "init",
          sdcpn: config.sdcpn,
          extensions: config.extensions,
          initialMarking: config.initialMarking,
          parameterValues: config.parameterValues,
          seed: config.seed,
          dt: config.dt,
          maxTime: config.maxTime,
          hirArtifacts: config.hirArtifacts,
          runCount: shard.runCount,
          runIndexOffset: shard.runIndexOffset,
          batchSize: config.batchSize,
          metricSpecs: "metricSpecs" in config ? config.metricSpecs : undefined,
        });
      }
    } catch (error) {
      rejectBeforeReady(
        error instanceof Error
          ? error
          : new Error("Failed to initialize Monte Carlo experiment"),
      );
    }
  });
}
