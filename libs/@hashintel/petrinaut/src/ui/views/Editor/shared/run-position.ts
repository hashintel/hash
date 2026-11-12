import type { RunClock } from "@hashintel/petrinaut-core";

/**
 * How a position of a run reads for its clock.
 *
 * A timed run's position is a time, which lands anywhere, so it prints to
 * the millisecond. An untimed run's position is a step. While one plays, the
 * viewed position moves between two steps and shows the state of the one it
 * has passed, so it reads as that step.
 */

/** The step a position has reached. A position a rounding short of a step is on it. */
export const stepAt = (position: number): number => Math.floor(position + 1e-9);

/** The position as a bare number: seconds to the millisecond, or the step reached. */
export const formatRunPosition = (clock: RunClock, position: number): string =>
  clock === "steps" ? String(stepAt(position)) : position.toFixed(3);

/** The position with its unit, as a tooltip or a screen reader says it. */
export const describeRunPosition = (
  clock: RunClock,
  position: number,
): string =>
  clock === "steps"
    ? `step ${stepAt(position)}`
    : `${position.toFixed(3)} seconds`;
