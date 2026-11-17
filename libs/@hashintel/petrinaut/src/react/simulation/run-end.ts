import type { RunClock } from "@hashintel/petrinaut-core";

/** Where a run on the clock stops. A run in steps stops at the first step at or past its end. */
export const runEndOf = (clock: RunClock, maxTime: number): number =>
  clock === "steps" ? Math.ceil(maxTime) : maxTime;

/** Whether a run on the clock can end at the value: positive, and whole in steps. */
export const acceptsRunEnd = (clock: RunClock, value: number): boolean =>
  value > 0 && (clock === "time" || Number.isInteger(value));
