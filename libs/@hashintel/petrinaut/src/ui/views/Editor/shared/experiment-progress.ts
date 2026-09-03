import type { ExperimentRecord } from "../../../../react/experiments/context";

/**
 * An experiment's progress bar percentage. A sweep runs several batches in
 * parallel, so its bar tracks the selected combination's sampled runs over
 * the run budget — the thing the charts show — rather than one batch's
 * simulated time, which would saw to 100% once per ladder rung. A plain
 * experiment's bar tracks simulated time.
 */
export const experimentProgressPercent = (
  experiment: Pick<
    ExperimentRecord,
    "sweep" | "progress" | "runCount" | "maxTime"
  >,
): number => {
  const fraction = experiment.sweep
    ? experiment.runCount > 0
      ? experiment.sweep.runsSampled / experiment.runCount
      : 0
    : experiment.progress && experiment.maxTime > 0
      ? experiment.progress.time / experiment.maxTime
      : 0;
  return Math.min(100, fraction * 100);
};
