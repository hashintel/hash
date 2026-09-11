/**
 * A sweep's state constraints as metrics its batches compute: one 0/1
 * indicator per constraint, `min` over each run's frames (the "always"
 * quantifier), every finished run sampled on the last frame, so a visited
 * cell's mean for the indicator is exactly the share of runs that passed.
 * The indicators ride every experiment request under `constraint:<id>` ids
 * and never appear on the record's own metric specs, so no tile or picker
 * shows them.
 */
import {
  compileStateConstraintIndicator,
  constraintLabel,
  constraintsInSpace,
  getOwn,
  type Constraint,
  type MonteCarloExpressionMetricSpec,
  type PetrinautExtensionSettings,
  type SDCPN,
} from "@hashintel/petrinaut-core";

import type { SweepVisitedCell } from "./sweep-session";

/** The request metric id a state constraint's indicator runs under; never a user metric id. */
export const constraintIndicatorMetricId = (constraintId: string): string =>
  `constraint:${constraintId}`;

/**
 * One precompiled expression spec per state constraint: the body wrapped as
 * `cond ? 1 : 0`, `min` over each run's frames so a run passes only when the
 * condition held on every sampled frame, every run sampled, distribution
 * output, so the last frame's bins are `[[0, failed], [1, passed]]`. Throws
 * naming the constraint when the emitter declines its body.
 */
export const constraintIndicatorSpecs = (
  constraints: readonly Constraint[],
  sdcpn: SDCPN,
  extensions: PetrinautExtensionSettings,
): MonteCarloExpressionMetricSpec[] =>
  constraintsInSpace(constraints, "state").map((constraint) => {
    const artifact = compileStateConstraintIndicator(
      constraint,
      sdcpn,
      extensions,
    );
    if (artifact === null) {
      throw new Error(
        `State constraint "${constraintLabel(constraint)}" cannot be compiled as a metric`,
      );
    }
    return {
      kind: "expression",
      id: constraintIndicatorMetricId(constraint.id),
      label: constraintLabel(constraint),
      code: constraint.code,
      artifact,
      sampleRuns: "all",
      runOutput: { type: "distribution" },
      aggregateTime: "min",
    };
  });

/**
 * A visited cell's verdict count for one state constraint: the indicator's
 * mean over the finished runs is `passed / total` exactly. Null when the
 * cell finished no run or carries no mean for the indicator.
 */
export const sweepCellPassCount = (
  cell: Pick<SweepVisitedCell, "runsCompleted" | "means">,
  constraintId: string,
): { runsPassed: number; runsTotal: number } | null => {
  const mean = getOwn(cell.means, constraintIndicatorMetricId(constraintId));
  if (cell.runsCompleted === 0 || mean === undefined) {
    return null;
  }
  return {
    runsPassed: Math.round(mean * cell.runsCompleted),
    runsTotal: cell.runsCompleted,
  };
};
