import type { RunClock } from "@hashintel/petrinaut-core";

/**
 * How a position of an execution reads.
 *
 * A timed execution's position is a time, which lands anywhere, so it prints
 * to the millisecond. An untimed one's position is a step. While one plays,
 * the viewed position moves between two steps and shows the state of the
 * one it has passed, so it reads as that step.
 *
 * An execution that happened in real time has an epoch: the instant of its
 * position 0 on the wall clock. Its positions then read as the time of day
 * they stand for, in the viewer's time zone, rather than as seconds since
 * the start.
 */

/** What positions count, and where position 0 is on the wall clock, when it is anywhere. */
export type RunAxis = {
  clock: RunClock;
  /** Milliseconds since the Unix epoch at position 0, or null for elapsed time only. */
  epochMs: number | null;
};

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

/** The instant of a position on the wall clock, or null on an axis without one. */
const wallClockAt = ({ clock, epochMs }: RunAxis, position: number) =>
  clock === "time" && epochMs !== null
    ? new Date(epochMs + position * 1000)
    : null;

/** Decimals of a second a time of day can print. */
type SecondDecimals = 0 | 1 | 2 | 3;

/** One format per number of decimals of a second, by that number. */
const timeOfDay = ([0, 1, 2, 3] as const).map(
  (decimals) =>
    new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
      ...(decimals === 0 ? {} : { fractionalSecondDigits: decimals }),
    }),
);

const dateAndTime = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  fractionalSecondDigits: 3,
  hourCycle: "h23",
  timeZoneName: "short",
});

/**
 * The time of day at a position, as `14:03:27`, or null on an axis without a
 * wall clock. `spacing` is how far apart the positions printed beside it
 * are, in seconds: positions less than a second apart print the decimals
 * that tell them apart. The date is left to {@link describeWallClock}.
 */
export const formatWallClock = (
  axis: RunAxis,
  position: number,
  spacing = 1,
): string | null => {
  const instant = wallClockAt(axis, position);
  if (instant === null) {
    return null;
  }
  const decimals =
    spacing > 0 && spacing < 1
      ? (Math.min(3, Math.ceil(-Math.log10(spacing))) as SecondDecimals)
      : 0;
  return timeOfDay[decimals]!.format(instant);
};

/** The date and the time at a position to the millisecond, with the time zone, or null. */
export const describeWallClock = (
  axis: RunAxis,
  position: number,
): string | null => {
  const instant = wallClockAt(axis, position);
  return instant === null ? null : dateAndTime.format(instant);
};
