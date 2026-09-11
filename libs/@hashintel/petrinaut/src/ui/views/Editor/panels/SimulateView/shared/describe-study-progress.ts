/**
 * One line saying where a study is and which step is the best so far, in
 * the study drawer's header and in the sweep navigator's status line once a
 * study driving the sweep has settled. Both read the same words, so the two
 * homes of a study never describe it differently.
 */
import {
  currentTrialNumber,
  finishedTrialCount,
  type OptimizationRecord,
} from "../../../../../../react/optimizations/context";
import { formatNumber } from "./format-value";

const bestPart = (best: OptimizationRecord["best"]): string =>
  best
    ? `best step so far: step ${best.trial + 1} (${formatNumber(best.objective)})`
    : "no best step yet";

/**
 * "Step 17 of 30 · best step so far: step 12 (650.5)" while live;
 * "Stopped after 17 of 30 steps · best step so far: step 12 (650.5)" once
 * settled; "Paused at 17 of 30 steps · 1 step finishing · best step so far:
 * step 12 (650.5)" while a pause drains.
 */
export const describeStudyProgress = (
  optimization: Pick<
    OptimizationRecord,
    | "status"
    | "connected"
    | "requestedTrials"
    | "completedTrials"
    | "prunedTrials"
    | "failedTrials"
    | "best"
  >,
): string => {
  const finished = finishedTrialCount(optimization);
  const requested = optimization.requestedTrials;
  const best = bestPart(optimization.best);
  switch (optimization.status) {
    case "initializing":
      return `Starting · ${best}`;
    case "running":
      return `Step ${currentTrialNumber(optimization)} of ${requested} · ${best}`;
    case "paused": {
      const inFlight = optimization.connected?.inFlight.length ?? 0;
      const finishing =
        inFlight === 0
          ? ""
          : ` · ${inFlight} ${inFlight === 1 ? "step" : "steps"} finishing`;
      return `Paused at ${finished} of ${requested} steps${finishing} · ${best}`;
    }
    case "complete":
      return finished === requested
        ? `Finished ${requested} steps · ${best}`
        : `Finished ${finished} of ${requested} steps · ${best}`;
    case "cancelled":
      return `${optimization.connected === null ? "Cancelled" : "Stopped"} after ${finished} of ${requested} steps · ${best}`;
    case "error":
      return `Failed after ${finished} of ${requested} steps · ${best}`;
  }
};

/** "4 / 30 · 3 runs each · 2 at once", with the parts that are 1 left out. */
export const describeStepProgress = (
  optimization: Pick<
    OptimizationRecord,
    | "completedTrials"
    | "prunedTrials"
    | "failedTrials"
    | "requestedTrials"
    | "connected"
    | "input"
  >,
): string => {
  const runsPerStep = optimization.input.execution.seedsPerTrial ?? 1;
  const parallelism = optimization.connected?.parallelism ?? 1;
  return [
    `${finishedTrialCount(optimization)} / ${optimization.requestedTrials}`,
    ...(runsPerStep > 1 ? [`${runsPerStep} runs each`] : []),
    ...(parallelism > 1 ? [`${parallelism} at once`] : []),
  ].join(" · ");
};
