import type { ExperimentRecord, ExperimentStatus } from "../context";
import type {
  MonteCarloExperimentState,
  MonteCarloUserDefinedMetricFrame,
} from "@hashintel/petrinaut-core";

export const mapExperimentStatus = (
  status: MonteCarloExperimentState,
): ExperimentStatus => {
  switch (status) {
    case "Initializing":
    case "Ready":
      return "initializing";
    case "Running":
      return "running";
    case "Complete":
      return "complete";
    case "Error":
      return "error";
    case "Cancelled":
      return "cancelled";
  }
};

/**
 * Keyed by the frames array: progress-only publishes reuse the previous
 * array, so the map is built once per distinct frame set.
 */
const latestFramesCache = new WeakMap<
  readonly MonteCarloUserDefinedMetricFrame[],
  Readonly<Record<string, MonteCarloUserDefinedMetricFrame>>
>();

/** Last frame per metric id, the shape the summary cards read. */
export const latestFramesById = (
  frames: readonly MonteCarloUserDefinedMetricFrame[],
): Readonly<Record<string, MonteCarloUserDefinedMetricFrame>> => {
  const cached = latestFramesCache.get(frames);
  if (cached) {
    return cached;
  }
  const latest: Record<string, MonteCarloUserDefinedMetricFrame> = {};
  for (const frame of frames) {
    latest[frame.metricId] = frame;
  }
  latestFramesCache.set(frames, latest);
  return latest;
};

/**
 * Applies `patch` to the matching record. `finishedAt` is the arrival time
 * of a patch that moves the experiment to a terminal status (null
 * otherwise); only the first such stamp counts, so the recorded time stays
 * the moment the run stopped even when several subscriptions sync the same
 * terminal status.
 */
export const patchExperimentRecords = (
  experiments: readonly ExperimentRecord[],
  experimentId: string,
  patch: Partial<ExperimentRecord>,
  finishedAt: number | null,
): ExperimentRecord[] =>
  experiments.map((experiment) => {
    if (experiment.id !== experimentId) {
      return experiment;
    }
    return {
      ...experiment,
      ...patch,
      ...(finishedAt !== null && experiment.finishedAt === null
        ? { finishedAt }
        : {}),
    };
  });
