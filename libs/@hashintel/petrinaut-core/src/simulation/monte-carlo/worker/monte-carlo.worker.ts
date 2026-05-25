import { createWorkerThreadRuntime } from "../../../environment";
import { SDCPNItemError } from "../../../errors";
import {
  createMonteCarloUserDefinedMetric,
  createMonteCarloUserDefinedMetricConfigsFromSpecs,
} from "../metrics";
import { createMonteCarloSimulator } from "../monte-carlo-simulator";

import type { MonteCarloUserDefinedMetric } from "../metrics";
import type { MonteCarloAdvanceResult, MonteCarloSimulator } from "../types";
import type {
  MonteCarloInitMessage,
  MonteCarloToMainMessage,
  MonteCarloToWorkerMessage,
  MonteCarloWorkerProgress,
} from "./messages";

const workerRuntime = createWorkerThreadRuntime<
  MonteCarloToWorkerMessage,
  MonteCarloToMainMessage
>();

const DEFAULT_BATCH_SIZE = 4;

let simulator: MonteCarloSimulator | null = null;
let userMetrics: MonteCarloUserDefinedMetric[] = [];
let isRunning = false;
let isInitialized = false;
let batchSize = DEFAULT_BATCH_SIZE;
let lastSentMetricFrameCounts = new Map<string, number>();
let latestProgress: MonteCarloWorkerProgress | null = null;

function postTypedMessage(message: MonteCarloToMainMessage): void {
  workerRuntime.postMessage(message);
}

function progressFromResult(
  result: MonteCarloAdvanceResult,
): MonteCarloWorkerProgress {
  const firstRunSummary = simulator?.getRunSummary(0);

  return {
    ...result,
    frameNumber: firstRunSummary?.frameNumber ?? 0,
    time: firstRunSummary?.currentTime ?? 0,
    runCount: simulator?.runCount ?? 0,
  };
}

function initialProgress(runCount: number): MonteCarloWorkerProgress {
  const summaries = simulator?.getSummaries() ?? [];
  const activeRuns = summaries.filter(
    (summary) => summary.status !== "complete" && summary.status !== "error",
  ).length;
  const completedRuns = summaries.filter(
    (summary) => summary.status === "complete",
  ).length;
  const erroredRuns = summaries.filter(
    (summary) => summary.status === "error",
  ).length;
  const firstRunSummary = summaries[0];

  return {
    activeRuns,
    advancedRuns: 0,
    allFinished: false,
    completedRuns,
    erroredRuns,
    frameNumber: firstRunSummary?.frameNumber ?? 0,
    runCount,
    time: firstRunSummary?.currentTime ?? 0,
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

function initialize(message: MonteCarloInitMessage): void {
  const metricSpecs = message.metricSpecs;
  userMetrics = metricSpecs
    ? createMonteCarloUserDefinedMetricConfigsFromSpecs(
        metricSpecs,
        message.sdcpn,
      ).map((metricConfig) => createMonteCarloUserDefinedMetric(metricConfig))
    : [];
  simulator = createMonteCarloSimulator({
    sdcpn: message.sdcpn,
    initialMarking: message.initialMarking,
    parameterValues: message.parameterValues,
    seed: message.seed,
    dt: message.dt,
    maxTime: message.maxTime,
    runCount: message.runCount,
    metrics: userMetrics,
  });
  batchSize = message.batchSize ?? DEFAULT_BATCH_SIZE;
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
        postTypedMessage({ type: "complete", progress: latestProgress });
        return;
      }
    }

    await workerRuntime.delay(0);
  }
}

workerRuntime.onMessage((message) => {
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
