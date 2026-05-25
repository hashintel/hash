import { createWorkerTransport } from "../../runtime/transport";
import {
  createMonteCarloUserDefinedMetricConfigsFromSpecs,
  createMonteCarloUserDefinedMetric,
  createPlaceTokenCountDistributionMetric,
} from "../metrics";
import { createMonteCarloSimulator } from "../monte-carlo-simulator";

import type { AbortSignalLike } from "../../../environment";
import type { ReadableStore } from "../../../handle";
import type { EventStream } from "../../../instance";
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
  PlaceTokenCountDistributionFrame,
  PlaceTokenCountDistributionMetric,
} from "../metrics";
import type { MonteCarloAdvanceResult, MonteCarloSimulator } from "../types";
import type {
  MonteCarloToMainMessage,
  MonteCarloWorkerProgress,
} from "../worker/messages";

export type MonteCarloExperimentState =
  | "Initializing"
  | "Ready"
  | "Running"
  | "Complete"
  | "Error"
  | "Cancelled";

export type MonteCarloExperimentDistributions = {
  frames: readonly PlaceTokenCountDistributionFrame[];
  latest: PlaceTokenCountDistributionFrame | null;
};

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
  initialMarking: InitialMarking;
  parameterValues: Record<string, string>;
  seed: number;
  dt: number;
  maxTime: number;
  runCount: number;
  batchSize?: number;
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
  readonly distributions: ReadableStore<MonteCarloExperimentDistributions>;
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
  const latestByMetricId = { ...state.latestByMetricId };

  for (const frame of nextFrames) {
    latestByMetricId[frame.metricId] = frame;
  }

  return {
    frames: [...state.frames, ...nextFrames],
    latestByMetricId,
  };
}

function getProgressFromResult(
  result: MonteCarloAdvanceResult,
  simulator: MonteCarloSimulator,
  distributionMetric: PlaceTokenCountDistributionMetric | null,
): MonteCarloWorkerProgress {
  const latestDistributionFrame = distributionMetric?.getLatestFrame();
  const firstRunSummary = latestDistributionFrame
    ? null
    : simulator.getRunSummary(0);

  return {
    ...result,
    frameNumber:
      latestDistributionFrame?.frameNumber ?? firstRunSummary?.frameNumber ?? 0,
    time: latestDistributionFrame?.time ?? firstRunSummary?.currentTime ?? 0,
    runCount: latestDistributionFrame?.runCount ?? simulator.runCount,
  };
}

function getInitialProgress(
  simulator: MonteCarloSimulator,
  distributionMetric: PlaceTokenCountDistributionMetric | null,
): MonteCarloWorkerProgress {
  const latestDistributionFrame = distributionMetric?.getLatestFrame();
  const summaries = latestDistributionFrame ? [] : simulator.getSummaries();
  const activeRuns =
    latestDistributionFrame?.activeRunCount ??
    summaries.filter(
      (summary) => summary.status !== "complete" && summary.status !== "error",
    ).length;
  const completedRuns =
    latestDistributionFrame?.completedRunCount ??
    summaries.filter((summary) => summary.status === "complete").length;
  const erroredRuns =
    latestDistributionFrame?.erroredRunCount ??
    summaries.filter((summary) => summary.status === "error").length;
  const firstRunSummary = latestDistributionFrame ? null : summaries[0];

  return {
    activeRuns,
    advancedRuns: 0,
    allFinished: false,
    completedRuns,
    erroredRuns,
    frameNumber:
      latestDistributionFrame?.frameNumber ?? firstRunSummary?.frameNumber ?? 0,
    runCount: latestDistributionFrame?.runCount ?? simulator.runCount,
    time: latestDistributionFrame?.time ?? firstRunSummary?.currentTime ?? 0,
  };
}

function getMetricsState(
  metrics: readonly MonteCarloUserDefinedMetric[],
): MonteCarloExperimentMetrics {
  const frames = metrics.flatMap((metric) => [...metric.frames]);
  const latestByMetricId: Record<string, MonteCarloUserDefinedMetricFrame> = {};

  for (const metric of metrics) {
    const latest = metric.getLatestFrame();
    if (latest) {
      latestByMetricId[metric.id] = latest;
    }
  }

  return {
    frames,
    latestByMetricId,
  };
}

function createLocalMonteCarloExperiment(
  config: CreateMonteCarloExperimentBaseConfig & {
    collectPlaceTokenCountDistribution?: boolean;
    metrics: readonly MonteCarloUserDefinedMetricConfig[];
  },
): Promise<MonteCarloExperiment> {
  const status = createReadableStore<MonteCarloExperimentState>("Initializing");
  const progress = createReadableStore<MonteCarloWorkerProgress | null>(null);
  const distributions = createReadableStore<MonteCarloExperimentDistributions>({
    frames: [],
    latest: null,
  });
  const metrics = createReadableStore<MonteCarloExperimentMetrics>(
    createEmptyMetricsState(),
  );
  const events = createEventStream<MonteCarloExperimentEvent>();
  let disposed = false;
  let running = false;
  let abortListener: (() => void) | null = null;

  try {
    const distributionMetric =
      config.collectPlaceTokenCountDistribution === false
        ? null
        : createPlaceTokenCountDistributionMetric();
    const userMetrics = config.metrics.map((metricConfig) =>
      createMonteCarloUserDefinedMetric(metricConfig),
    );
    const frameMetrics = distributionMetric
      ? [distributionMetric, ...userMetrics]
      : userMetrics;
    const simulator = createMonteCarloSimulator({
      sdcpn: config.sdcpn,
      initialMarking: config.initialMarking,
      parameterValues: config.parameterValues,
      seed: config.seed,
      dt: config.dt,
      maxTime: config.maxTime,
      runCount: config.runCount,
      metrics: frameMetrics,
    });

    const syncStores = (nextProgress: MonteCarloWorkerProgress | null) => {
      const distributionFrames = distributionMetric?.frames ?? [];
      distributions.set({
        frames: distributionFrames,
        latest: distributionFrames.at(-1) ?? null,
      });
      metrics.set(getMetricsState(userMetrics));
      if (nextProgress) {
        progress.set(nextProgress);
      }
    };

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
            distributionMetric,
          );
          syncStores(nextProgress);

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
      distributions,
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

    const initialProgress = getInitialProgress(simulator, distributionMetric);
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
 * The returned handle exposes status, progress, streamed distribution frames,
 * optional user-defined metric frames, lifecycle events, start/cancel controls,
 * and cleanup around the core Monte Carlo simulator. Worker-backed experiments
 * use a transport; metric callback configs and experiment metric specs run
 * locally because executable metric code cannot be posted to a worker.
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
      collectPlaceTokenCountDistribution: metricSpecs.some(
        (metricSpec) => metricSpec.kind === "placeTokenCountDistribution",
      ),
      metrics: createMonteCarloUserDefinedMetricConfigsFromSpecs(
        metricSpecs,
        config.sdcpn,
      ),
    });
  }

  let transport: SimulationTransport;
  if ("transport" in config && config.transport !== undefined) {
    transport = config.transport;
  } else if ("createWorker" in config && config.createWorker !== undefined) {
    transport = createWorkerTransport(config.createWorker);
  } else {
    return Promise.reject(
      new Error(
        "Monte Carlo experiment requires a worker, transport, metrics, or local metric specs",
      ),
    );
  }
  const status = createReadableStore<MonteCarloExperimentState>("Initializing");
  const progress = createReadableStore<MonteCarloWorkerProgress | null>(null);
  const distributions = createReadableStore<MonteCarloExperimentDistributions>({
    frames: [],
    latest: null,
  });
  const metrics = createReadableStore<MonteCarloExperimentMetrics>(
    createEmptyMetricsState(),
  );
  const events = createEventStream<MonteCarloExperimentEvent>();
  let disposed = false;

  return new Promise<MonteCarloExperiment>((resolve, reject) => {
    let settled = false;
    let off: (() => void) | null = null;
    let abortListener: (() => void) | null = null;

    const cleanupTransport = ({ sendCancel }: { sendCancel: boolean }) => {
      if (disposed) {
        return;
      }

      disposed = true;
      if (abortListener) {
        config.signal?.removeEventListener("abort", abortListener);
        abortListener = null;
      }
      off?.();
      off = null;

      if (sendCancel) {
        try {
          transport.send({ type: "cancel" });
        } catch {
          // Transport may already be torn down.
        }
      }

      transport.terminate();
    };

    const rejectBeforeReady = (error: Error) => {
      if (settled) {
        return;
      }

      settled = true;
      cleanupTransport({ sendCancel: false });
      reject(error);
    };

    const onAbort = () => {
      if (!settled) {
        settled = true;
        const error = new Error("Monte Carlo experiment start aborted");
        error.name = "AbortError";
        reject(error);
      }
      cleanupTransport({ sendCancel: true });
    };

    abortListener = onAbort;

    const handle: MonteCarloExperiment = {
      status,
      progress,
      distributions,
      metrics,
      events,
      start() {
        if (disposed) {
          return;
        }
        status.set("Running");
        transport.send({ type: "start" });
      },
      cancel() {
        if (disposed) {
          return;
        }
        transport.send({ type: "cancel" });
      },
      dispose() {
        cleanupTransport({ sendCancel: true });
      },
    };

    off = transport.onMessage((rawMessage) => {
      const message = rawMessage as MonteCarloToMainMessage;

      switch (message.type) {
        case "ready": {
          status.set("Ready");
          if (!settled) {
            settled = true;
            resolve(handle);
          }
          break;
        }
        case "distributionFrames": {
          const frames = [...distributions.get().frames, ...message.frames];
          distributions.set({
            frames,
            latest: frames.at(-1) ?? null,
          });
          break;
        }
        case "metricFrames": {
          metrics.set(appendMetricFrames(metrics.get(), message.frames));
          break;
        }
        case "progress":
          progress.set(message.progress);
          break;
        case "complete":
          progress.set(message.progress);
          status.set("Complete");
          events.emit({ type: "complete", progress: message.progress });
          break;
        case "cancelled":
          progress.set(message.progress);
          status.set("Cancelled");
          events.emit({ type: "cancelled", progress: message.progress });
          break;
        case "error":
          status.set("Error");
          events.emit({
            type: "error",
            message: message.message,
            itemId: message.itemId,
          });
          if (!settled) {
            rejectBeforeReady(new Error(message.message));
          }
          break;
      }
    });

    if (config.signal) {
      if (config.signal.aborted) {
        onAbort();
        return;
      }
      config.signal.addEventListener("abort", onAbort, { once: true });
    }

    try {
      transport.send({
        type: "init",
        sdcpn: config.sdcpn,
        initialMarking: config.initialMarking,
        parameterValues: config.parameterValues,
        seed: config.seed,
        dt: config.dt,
        maxTime: config.maxTime,
        runCount: config.runCount,
        batchSize: config.batchSize,
        metricSpecs: "metricSpecs" in config ? config.metricSpecs : undefined,
      });
    } catch (error) {
      rejectBeforeReady(
        error instanceof Error
          ? error
          : new Error("Failed to initialize Monte Carlo experiment"),
      );
    }
  });
}
