/**
 * The Monte Carlo worker protocol, detached from any thread host.
 *
 * The protocol logic lives here so every host runs the same code: the editor's
 * Web Worker entry wraps `self`, the CLI's `worker_threads` entry wraps
 * `parentPort`, and the in-process worker wraps a plain callback pair. What a
 * host must supply is only a {@link WorkerThreadRuntime}: post a message,
 * receive messages, and yield between compute batches.
 */
import { SDCPNItemError } from "../../../errors";
import { DEFAULT_PETRINAUT_EXTENSIONS } from "../../../extensions";
import { resolveNetParameterValues } from "../../../parameter-values";
import {
  createMonteCarloUserDefinedMetric,
  createMonteCarloUserDefinedMetricConfigsFromSpecs,
} from "../metrics";
import { createMonteCarloSimulator } from "../monte-carlo-simulator";

import type { WorkerThreadRuntime } from "../../../environment";
import type {
  MonteCarloUserDefinedMetric,
  MonteCarloUserDefinedMetricFrame,
} from "../metrics";
import type { MonteCarloAdvanceResult, MonteCarloSimulator } from "../types";
import type {
  MonteCarloInitMessage,
  MonteCarloRunResultEntry,
  MonteCarloToMainMessage,
  MonteCarloToWorkerMessage,
  MonteCarloWorkerProgress,
} from "./messages";

const DEFAULT_BATCH_SIZE = 4;

/**
 * Runs the Monte Carlo worker protocol against `runtime`.
 *
 * Handles `init`/`start`/`cancel`, streams `progress` and `metricFrames`, and
 * posts each run's final metric values as `runResults` before `complete`.
 */
export function attachMonteCarloWorker(
  runtime: WorkerThreadRuntime<
    MonteCarloToWorkerMessage,
    MonteCarloToMainMessage
  >,
): void {
  let simulator: MonteCarloSimulator | null = null;
  let userMetrics: MonteCarloUserDefinedMetric[] = [];
  let isRunning = false;
  let isInitialized = false;
  let batchSize = DEFAULT_BATCH_SIZE;
  let runIndexOffset = 0;
  let lastSentMetricFrameCounts = new Map<string, number>();
  let latestProgress: MonteCarloWorkerProgress | null = null;

  function postTypedMessage(message: MonteCarloToMainMessage): void {
    runtime.postMessage(message);
  }

  function getLatestMetricFrame(): MonteCarloUserDefinedMetricFrame | null {
    let latest: MonteCarloUserDefinedMetricFrame | null = null;

    for (const metric of userMetrics) {
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

  function getProgressPosition(): Pick<
    MonteCarloWorkerProgress,
    "frameNumber" | "time"
  > {
    const latestMetricFrame = getLatestMetricFrame();
    if (latestMetricFrame) {
      return {
        frameNumber: latestMetricFrame.frameNumber,
        time: latestMetricFrame.time,
      };
    }

    let frameNumber = 0;
    let time = 0;

    for (const summary of simulator?.getSummaries() ?? []) {
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

  function progressFromResult(
    result: MonteCarloAdvanceResult,
  ): MonteCarloWorkerProgress {
    const position = getProgressPosition();

    return {
      ...result,
      frameNumber: position.frameNumber,
      time: position.time,
      runCount: simulator?.runCount ?? 0,
    };
  }

  function initialProgress(runCount: number): MonteCarloWorkerProgress {
    const summaries = simulator?.getSummaries() ?? [];
    const position = getProgressPosition();
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
      runCount,
      time: position.time,
    };
  }

  function postPendingMetricFrames(): void {
    if (userMetrics.length === 0) {
      return;
    }

    const frames = userMetrics.flatMap((metric) => {
      const lastSentCount = lastSentMetricFrameCounts.get(metric.id) ?? 0;
      lastSentMetricFrameCounts.set(metric.id, metric.frames.length);

      return metric.frames.slice(lastSentCount);
    });

    if (frames.length > 0) {
      postTypedMessage({ type: "metricFrames", frames });
    }
  }

  /** Each run's final metric values, keyed by the run's global index. */
  function collectRunResults(): MonteCarloRunResultEntry[] {
    const byRunIndex = new Map<number, Record<string, number>>();

    for (const metric of userMetrics) {
      for (const [localRunIndex, value] of metric.getRunValues()) {
        const globalRunIndex = runIndexOffset + localRunIndex;
        let values = byRunIndex.get(globalRunIndex);
        if (!values) {
          values = {};
          byRunIndex.set(globalRunIndex, values);
        }
        values[metric.id] = value;
      }
    }

    return [...byRunIndex.entries()]
      .sort(([left], [right]) => left - right)
      .map(([runIndex, values]) => ({ runIndex, values }));
  }

  function initialize(message: MonteCarloInitMessage): void {
    const metricSpecs = message.metricSpecs;
    userMetrics = metricSpecs
      ? createMonteCarloUserDefinedMetricConfigsFromSpecs(
          metricSpecs,
          message.sdcpn,
          resolveNetParameterValues(
            message.sdcpn.parameters,
            message.parameterValues,
            (message.extensions ?? DEFAULT_PETRINAUT_EXTENSIONS).parameters,
          ),
        ).map((metricConfig) => createMonteCarloUserDefinedMetric(metricConfig))
      : [];
    simulator = createMonteCarloSimulator({
      sdcpn: message.sdcpn,
      extensions: message.extensions,
      initialMarking: message.initialMarking,
      parameterValues: message.parameterValues,
      seed: message.seed,
      dt: message.dt,
      maxTime: message.maxTime,
      hirArtifacts: message.hirArtifacts,
      runCount: message.runCount,
      runIndexOffset: message.runIndexOffset,
      runs: message.runs,
      metrics: userMetrics,
    });
    batchSize = message.batchSize ?? DEFAULT_BATCH_SIZE;
    runIndexOffset = message.runIndexOffset ?? 0;
    isInitialized = true;
    isRunning = false;
    lastSentMetricFrameCounts = new Map();
    latestProgress = initialProgress(message.runCount);

    postTypedMessage({ type: "ready" });
    postPendingMetricFrames();
    postTypedMessage({ type: "progress", progress: latestProgress });
  }

  async function computeLoop(): Promise<void> {
    while (isRunning) {
      const currentSimulator = simulator;
      if (!currentSimulator) {
        return;
      }

      let result: MonteCarloAdvanceResult | null = null;

      for (let i = 0; i < batchSize; i++) {
        result = currentSimulator.advanceAll();
        if (result.allFinished) {
          break;
        }
      }

      if (result) {
        latestProgress = progressFromResult(result);
        postPendingMetricFrames();
        postTypedMessage({ type: "progress", progress: latestProgress });

        if (result.allFinished) {
          isRunning = false;
          const results = collectRunResults();
          if (results.length > 0) {
            postTypedMessage({ type: "runResults", results });
          }
          postTypedMessage({ type: "complete", progress: latestProgress });
          return;
        }
      }

      await runtime.delay(0);
    }
  }

  runtime.onMessage((message) => {
    switch (message.type) {
      case "init": {
        try {
          initialize(message);
        } catch (error) {
          isInitialized = false;
          isRunning = false;
          simulator = null;
          userMetrics = [];
          postTypedMessage({
            type: "error",
            message:
              error instanceof Error
                ? error.message
                : "Failed to initialize Monte Carlo experiment",
            itemId: error instanceof SDCPNItemError ? error.itemId : null,
          });
        }
        break;
      }

      case "start": {
        if (!isInitialized || !simulator) {
          postTypedMessage({
            type: "error",
            message: "Cannot start: Monte Carlo experiment is not initialized",
            itemId: null,
          });
          return;
        }

        if (isRunning) {
          return;
        }

        isRunning = true;
        void computeLoop().catch((error: unknown) => {
          isRunning = false;
          postTypedMessage({
            type: "error",
            message:
              error instanceof Error
                ? error.message
                : "Unknown error during Monte Carlo computation",
            itemId: error instanceof SDCPNItemError ? error.itemId : null,
          });
        });
        break;
      }

      case "cancel": {
        isRunning = false;
        simulator = null;
        isInitialized = false;
        postTypedMessage({ type: "cancelled", progress: latestProgress });
        break;
      }
    }
  });
}
