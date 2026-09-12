/**
 * The Create Experiment drawer's Objective section as data: the draft the
 * section edits, the metric it resolves to, the budget pre-check that mirrors
 * the manifest schema's caps before anything is created, and the objective
 * the study starts with.
 */
import {
  PETRINAUT_OPTIMIZATION_MAX_STEPS_PER_TRIAL,
  PETRINAUT_OPTIMIZATION_MAX_TOTAL_STEPS,
  PETRINAUT_OPTIMIZATION_MAX_TRIALS,
} from "@hashintel/petrinaut-core/optimization";

import type { SweepObjective } from "../sweep-optimizer";
import type { PetrinautOptimizationDirection } from "@hashintel/petrinaut-core/optimization";

/** The number of steps the section proposes. */
export const SWEEP_OPTIMIZATION_DEFAULT_STEPS = 30;

/**
 * The section's state. `metricId` may name a draft that was removed since and
 * is resolved against the current drafts at read time; `steps` is null while
 * the field is blank.
 */
export type SweepObjectiveDraft = {
  metricId: string | null;
  direction: PetrinautOptimizationDirection;
  steps: number | null;
};

export const EMPTY_SWEEP_OBJECTIVE: SweepObjectiveDraft = {
  metricId: null,
  direction: "maximize",
  steps: SWEEP_OPTIMIZATION_DEFAULT_STEPS,
};

/**
 * The metric the study reads: the chosen draft while it exists, else the
 * first draft; null without drafts. Derived in render, never synced.
 */
export const resolveObjectiveMetricId = (
  draft: SweepObjectiveDraft,
  metrics: readonly { id: string }[],
): string | null =>
  metrics.some((metric) => metric.id === draft.metricId)
    ? draft.metricId
    : (metrics[0]?.id ?? null);

/** What the study start reads of the experiment's execution, and the runs a step computes. */
export type SweepObjectiveExecution = {
  dt: number;
  maxTime: number;
  runsPerStep: number;
};

/**
 * Why the objective cannot start, before anything is created: no metric, a
 * blank or out-of-range step count, or one of the schema's two budgets —
 * `ceil(maxTime / dt)` over the per-run cap, or `ceil(maxTime / dt) ×
 * runsPerStep × steps` over the total. Null when clean. A time step or max
 * time that makes no run is not the objective's to report: the experiment's
 * own validation rejects it at submit.
 */
export const sweepObjectiveError = (
  draft: SweepObjectiveDraft,
  metricId: string | null,
  execution: SweepObjectiveExecution,
): string | null => {
  if (metricId === null) {
    return "Add a metric to optimize";
  }
  const { steps } = draft;
  if (
    steps === null ||
    !Number.isInteger(steps) ||
    steps < 1 ||
    steps > PETRINAUT_OPTIMIZATION_MAX_TRIALS
  ) {
    return `Ask for 1 to ${PETRINAUT_OPTIMIZATION_MAX_TRIALS.toLocaleString()} steps`;
  }
  const stepsPerRun = Math.ceil(execution.maxTime / execution.dt);
  if (!Number.isFinite(stepsPerRun) || stepsPerRun <= 0) {
    return null;
  }
  if (stepsPerRun > PETRINAUT_OPTIMIZATION_MAX_STEPS_PER_TRIAL) {
    return `Each run would take ${stepsPerRun.toLocaleString()} steps; the optimizer allows ${PETRINAUT_OPTIMIZATION_MAX_STEPS_PER_TRIAL.toLocaleString()}`;
  }
  if (
    stepsPerRun * execution.runsPerStep * steps >
    PETRINAUT_OPTIMIZATION_MAX_TOTAL_STEPS
  ) {
    return `${steps.toLocaleString()} steps × ${execution.runsPerStep} runs × ${stepsPerRun.toLocaleString()} simulation steps is over the optimizer's ${PETRINAUT_OPTIMIZATION_MAX_TOTAL_STEPS.toLocaleString()} budget`;
  }
  return null;
};

/**
 * The objective as the study start takes it; null exactly when
 * {@link sweepObjectiveError} reports one.
 */
export const sweepObjectiveFor = (
  draft: SweepObjectiveDraft,
  metricId: string | null,
  execution: SweepObjectiveExecution,
): SweepObjective | null =>
  metricId === null ||
  draft.steps === null ||
  sweepObjectiveError(draft, metricId, execution) !== null
    ? null
    : { metricId, direction: draft.direction, steps: draft.steps };

/** "30 steps · 8 runs each — the best point then refines to your run budget" */
export const describeSweepObjective = (
  steps: number,
  runsPerStep: number,
): string =>
  `${steps.toLocaleString()} ${steps === 1 ? "step" : "steps"} · ${runsPerStep} runs each — the best point then refines to your run budget`;
