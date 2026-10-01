/**
 * Example results for the constraint prototype. Nothing here comes from a
 * run: the numbers and the series are made up so the panel and the sidebar
 * can show where a last experiment's results would go. A constraint without
 * an entry has no results. Callers label everything read from here as
 * example data.
 */

import type { ModelConstraint } from "../../react/controller-prototype/constraints";

export type ConstraintResult = {
  experiment: string;
  runs: number;
  /** Runs in which the constraint held. */
  held: number;
  /** The first run that broke it, and where in that run it first broke. */
  firstFailingRun: number;
  firstBreak: { step: number; day: number };
};

const exampleResults: Record<string, ConstraintResult> = {
  backorders_under_20: {
    experiment: "Balanced dual source",
    runs: 200,
    held: 184,
    firstFailingRun: 17,
    firstBreak: { step: 754, day: 75.4 },
  },
  machine_health_above_0_2: {
    experiment: "Balanced dual source",
    runs: 200,
    held: 200,
    firstFailingRun: 0,
    firstBreak: { step: 0, day: 0 },
  },
  scrap_under_5: {
    experiment: "Balanced dual source",
    runs: 200,
    held: 197,
    firstFailingRun: 43,
    firstBreak: { step: 1612, day: 161.2 },
  },
  order_wait_under_14_days: {
    experiment: "Balanced dual source",
    runs: 200,
    held: 171,
    firstFailingRun: 9,
    firstBreak: { step: 1120, day: 112 },
  },
};

let enabled = true;

/** Turns the example results off, so the prototype can show a net no experiment has run on. */
export const setExampleResultsEnabled = (value: boolean): void => {
  enabled = value;
};

export const exampleResultFor = (id: string): ConstraintResult | undefined =>
  enabled ? exampleResults[id] : undefined;

export const exampleResultHeld = (
  result: ConstraintResult,
  tolerance: number,
): boolean => (result.held / result.runs) * 100 >= tolerance;

export const EXAMPLE_DATA_NOTE = "Example data, not a recorded run";

/** A step series of the checked value over a run, in days. Deterministic. */
export type SeriesPoint = { day: number; value: number };

const seeded = (seed: number) => {
  let state = seed % 2147483647;
  if (state <= 0) {
    state += 2147483646;
  }
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
};

const hash = (text: string): number =>
  Array.from(text).reduce(
    (total, char) => (total * 31 + char.charCodeAt(0)) % 2147483647,
    7,
  );

/**
 * Ten-day steps hovering below the limit, with the first break at
 * `firstBreak.day`: from there the value stays above the limit for about 40
 * days, then falls back. The run ends at day 360.
 */
export const exampleSeries = (
  constraint: ModelConstraint,
  result: ConstraintResult,
  limit: number,
): SeriesPoint[] => {
  const random = seeded(hash(constraint.id));
  const points: SeriesPoint[] = [];
  const breakDay = result.firstBreak.day;
  const overUntil = breakDay + 40;
  let afterBreak = false;
  for (let day = 0; day < 360; day += 10) {
    if (!afterBreak && day + 10 > breakDay) {
      afterBreak = true;
      points.push({ day, value: limit * (0.75 + random() * 0.1) });
      points.push({ day: breakDay, value: limit * 1.15 });
      continue;
    }
    if (afterBreak && day < overUntil) {
      if (day > breakDay) {
        points.push({ day, value: limit * (1.1 + random() * 0.25) });
      }
      continue;
    }
    const near = day >= breakDay - 40 && day < breakDay;
    const base = near ? 0.65 + random() * 0.15 : 0.25 + random() * 0.5;
    points.push({ day, value: limit * base });
  }
  return points;
};
