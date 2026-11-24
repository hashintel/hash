import { runStates } from "../../shared/run-state";
import {
  formatDuration,
  formatRunTime,
  getRunDuration,
} from "../../shared/run-times";

import type { RunState } from "../../shared/run-state";

/**
 * How long the run took and when it started, duration first: "1m 52s · Today, 08:15". A running run's duration is
 * to `now`, and a run waiting on a person says so first: "Needs review · 3m 20s · Today, 10:42". A run that stopped
 * with no end recorded has only its start.
 */
export const formatRunTimeLine = (
  run: { state: RunState; startedAt: Date; endedAt: Date | null },
  now: Date,
) => {
  const duration = getRunDuration(run, now);

  return [
    run.state === "needsReview" ? runStates.needsReview.label : null,
    duration === null ? null : formatDuration(duration),
    formatRunTime(run.startedAt, now),
  ]
    .filter((part) => part !== null)
    .join(" · ");
};
