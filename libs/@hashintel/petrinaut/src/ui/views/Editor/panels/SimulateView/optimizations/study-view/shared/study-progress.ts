/**
 * A study's progress as the summary's bars and activity list show it: steps
 * finished over steps requested, the followed step's runs over the runs each
 * step gets, and the batches computing right now, each named.
 */
import {
  type ConnectedStudyState,
  followedTrial,
  type OptimizationBatchStatus,
  type OptimizationRecord,
} from "../../../../../../../../react/optimizations/context";
import { formatParameters } from "../../../shared/format-value";

import type {
  ComputeActivityBar,
  ComputeActivityBatch,
} from "../../../shared/compute-activity";

export const finishedStepCount = (
  optimization: Pick<
    OptimizationRecord,
    "completedTrials" | "prunedTrials" | "failedTrials"
  >,
): number =>
  optimization.completedTrials +
  optimization.prunedTrials +
  optimization.failedTrials;

/** The main bar: steps finished over steps requested. */
export const stepsBar = (
  optimization: Pick<
    OptimizationRecord,
    "completedTrials" | "prunedTrials" | "failedTrials" | "requestedTrials"
  >,
  label?: string,
): ComputeActivityBar => {
  const finished = finishedStepCount(optimization);
  return {
    percent:
      optimization.requestedTrials > 0
        ? Math.min(100, (finished / optimization.requestedTrials) * 100)
        : 0,
    label,
  };
};

/**
 * The thinner bar beneath: the followed step's runs over the runs each step
 * gets, while a step is being followed.
 */
export const followedStepBar = (
  optimization: Pick<OptimizationRecord, "input" | "connected">,
): ComputeActivityBar | null => {
  const selection = optimization.connected?.selection ?? null;
  if (selection === null || !selection.computing) {
    return null;
  }
  const trial = followedTrial(selection.key);
  if (trial === null) {
    return null;
  }
  const runsPerStep = optimization.input.execution.seedsPerTrial ?? 1;
  return {
    percent: Math.min(100, (selection.runsCompleted / runsPerStep) * 100),
    label: `Step ${trial + 1} · ${selection.runsCompleted} / ${runsPerStep} runs`,
  };
};

/** A batch as the activity list names it: "Step 4", or "Refining population=1850, infected_ratio=0.36". */
export const describeBatch = (batch: OptimizationBatchStatus): string =>
  batch.kind === "trial"
    ? `Step ${batch.trial + 1}`
    : `Refining ${formatParameters(batch.values)}`;

/** The study's batches as the activity list shows them; steps are the priority work. */
export const activityBatches = (
  connected: ConnectedStudyState | null,
): ComputeActivityBatch[] =>
  (connected?.activity ?? []).map((batch) => ({
    id: String(batch.id),
    label: describeBatch(batch),
    tone: batch.kind === "trial" ? "priority" : "background",
    runCount: batch.runCount,
    completedRuns: batch.completedRuns,
  }));
