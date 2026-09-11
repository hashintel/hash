/**
 * The Sensitivity analysis card's data: one row per optimized parameter with
 * the PED-ANOVA share the optimizer last reported and a signed Pearson
 * correlation computed here from the completed steps, plus the floor under
 * which the estimate is only a hint. Pure, so the fade rule and the maths are
 * tested without the DOM.
 */
import { partitionParameterBindings } from "../../../../../../../react/optimizations/parameter-bindings";

import type { OptimizationRecord } from "../../../../../../../react/optimizations/context";
import type { PetrinautOptimizationTrialEvent } from "@hashintel/petrinaut-core";

/** A study requesting this many steps or more earns the higher floor. */
const LONG_STUDY_TRIALS = 100;

/** Pearson needs this many completed steps before it says anything. */
const MIN_CORRELATION_TRIALS = 3;

export type ImportanceRow = {
  identifier: string;
  /** PED-ANOVA share of relative importance for reaching the best steps; null while none was received. */
  importance: number | null;
  /** Signed Pearson correlation of the parameter with the objective over the completed steps. */
  correlation: number | null;
};

export type ImportanceView = {
  /** In binding order, so rows never move as estimates land. */
  rows: readonly ImportanceRow[];
  /** Whether PED-ANOVA can rank the study at all: it needs two or more optimized parameters. */
  rankable: boolean;
  /** Whether an estimate has been received at all. */
  estimated: boolean;
  /** Completed steps the estimate is fitted on, or completed so far while none was received. */
  effectiveCount: number;
  floor: number;
  belowFloor: boolean;
  /**
   * What a full-width bar stands for. The largest share above the floor;
   * the whole unit below it, so faded bars never set the scale.
   */
  barScale: number;
};

/** The completed-step count from which the estimate is worth trusting; matches the optimizer core. */
export const importanceFloor = (requestedTrials: number): number =>
  requestedTrials >= LONG_STUDY_TRIALS ? LONG_STUDY_TRIALS : 50;

const asNumber = (value: number | boolean | undefined): number | null =>
  typeof value === "boolean" ? (value ? 1 : 0) : (value ?? null);

const pearson = (
  pairs: readonly (readonly [number, number])[],
): number | null => {
  if (pairs.length < MIN_CORRELATION_TRIALS) {
    return null;
  }
  let sumX = 0;
  let sumY = 0;
  for (const [x, y] of pairs) {
    sumX += x;
    sumY += y;
  }
  const meanX = sumX / pairs.length;
  const meanY = sumY / pairs.length;
  let covariance = 0;
  let varianceX = 0;
  let varianceY = 0;
  for (const [x, y] of pairs) {
    covariance += (x - meanX) * (y - meanY);
    varianceX += (x - meanX) ** 2;
    varianceY += (y - meanY) ** 2;
  }
  if (varianceX === 0 || varianceY === 0) {
    return null;
  }
  return covariance / Math.sqrt(varianceX * varianceY);
};

/**
 * The signed Pearson correlation of each parameter with the objective over
 * the completed steps, booleans as 0 and 1. Null under three completed steps
 * and when either side has no variance.
 */
export const pearsonCorrelations = (
  trials: readonly PetrinautOptimizationTrialEvent[],
  identifiers: readonly string[],
): Record<string, number | null> => {
  const completed = trials.filter(
    (trial) => trial.state === "complete" && trial.objective !== null,
  );
  const correlations: Record<string, number | null> = {};
  for (const identifier of identifiers) {
    const pairs: (readonly [number, number])[] = [];
    for (const trial of completed) {
      const value = asNumber(trial.parameters[identifier]);
      if (value !== null && trial.objective !== null) {
        pairs.push([value, trial.objective]);
      }
    }
    correlations[identifier] = pearson(pairs);
  }
  return correlations;
};

/** The card's rows and its fade verdict, derived from the record alone. */
export const importanceRows = (
  optimization: Pick<
    OptimizationRecord,
    "trials" | "importance" | "input" | "requestedTrials" | "completedTrials"
  >,
): ImportanceView => {
  const { trials, importance, input, requestedTrials, completedTrials } =
    optimization;
  const identifiers = Object.keys(partitionParameterBindings(input).optimized);
  const correlations = pearsonCorrelations(trials, identifiers);
  const rows = identifiers.map(
    (identifier): ImportanceRow => ({
      identifier,
      importance: importance?.values[identifier] ?? null,
      correlation: correlations[identifier] ?? null,
    }),
  );
  const effectiveCount = importance?.completedTrials ?? completedTrials;
  const floor = importanceFloor(requestedTrials);
  // The same rule as the optimizer core: one parameter has nothing to rank against.
  const rankable = identifiers.length >= 2;
  const belowFloor = rankable && effectiveCount < floor;
  const largest = rows.reduce(
    (max, row) => Math.max(max, row.importance ?? 0),
    0,
  );
  return {
    rows,
    rankable,
    estimated: importance !== null,
    effectiveCount,
    floor,
    belowFloor,
    barScale: belowFloor || largest === 0 ? 1 : largest,
  };
};

/**
 * The line under the card's title: the statistic and the count first, so
 * they survive a narrow card's clipping. Before the first estimate the line
 * says so rather than claiming an estimate over the steps completed so far;
 * a study with one optimized parameter never gets one, so its line says why
 * and points at the correlation column.
 */
export const describeImportance = (view: ImportanceView): string => {
  const steps = `${view.effectiveCount} completed ${view.effectiveCount === 1 ? "step" : "steps"}`;
  if (!view.rankable) {
    return `PED-ANOVA ranks two or more parameters · ${steps} · correlation only`;
  }
  const count = view.estimated
    ? `PED-ANOVA importance estimated from ${steps}`
    : `no PED-ANOVA importance yet · ${steps}`;
  const floor = view.belowFloor
    ? ` · below the ${view.floor}-step floor, treat as a hint`
    : "";
  return `${count}${floor} · how much each parameter matters for reaching the best steps`;
};

/** A share as the bar prints it: a whole percentage. */
export const formatImportance = (importance: number): string =>
  `${Math.round(importance * 100)}%`;

/** A correlation with its sign always shown, a true minus sign for the negative side. */
export const formatCorrelation = (correlation: number): string => {
  const magnitude = Math.abs(correlation).toFixed(2);
  return correlation < 0 ? `−${magnitude}` : `+${magnitude}`;
};
