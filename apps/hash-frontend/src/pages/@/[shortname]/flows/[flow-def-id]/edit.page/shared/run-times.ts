import { format, isSameDay, isSameYear, subDays } from "date-fns";

import { runStates } from "./run-state";

import type { RunState } from "./run-state";

/** When something in a run happened: "Today, 08:15", "Yesterday, 08:15", "5 Nov, 08:15" or "18 Nov 2025, 08:15". */
export const formatRunTime = (date: Date, now: Date) => {
  const time = format(date, "HH:mm");

  if (isSameDay(date, now)) {
    return `Today, ${time}`;
  }

  if (isSameDay(date, subDays(now, 1))) {
    return `Yesterday, ${time}`;
  }

  return format(
    date,
    isSameYear(date, now) ? "d MMM, HH:mm" : "d MMM yyyy, HH:mm",
  );
};

/** When a run ended: only the time if it ended on the day it started. */
export const formatEndTime = (endedAt: Date, startedAt: Date, now: Date) =>
  isSameDay(endedAt, startedAt)
    ? format(endedAt, "HH:mm")
    : formatRunTime(endedAt, now);

const twoDigits = (value: number) => String(value).padStart(2, "0");

/** "45s", "1m 05s" or "48h 02m". */
export const formatDuration = (milliseconds: number) => {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${twoDigits(minutes % 60)}m`;
  }

  return minutes > 0
    ? `${minutes}m ${twoDigits(seconds % 60)}s`
    : `${seconds}s`;
};

/** How long a run took, or has taken so far while it runs. `null` for a run that stopped with no end recorded. */
export const getRunDuration = (
  run: { state: RunState; startedAt: Date; endedAt: Date | null },
  now: Date,
) => {
  if (run.endedAt) {
    return run.endedAt.getTime() - run.startedAt.getTime();
  }

  return runStates[run.state].tab === "running"
    ? now.getTime() - run.startedAt.getTime()
    : null;
};

/** Newest first, then by short ID for runs started at the same moment: how the Logs table and the run switcher order runs. */
export const compareNewestFirst = (
  left: { startedAt: Date; shortId: string },
  right: { startedAt: Date; shortId: string },
) =>
  right.startedAt.getTime() - left.startedAt.getTime() ||
  left.shortId.localeCompare(right.shortId);
