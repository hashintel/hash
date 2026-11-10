import { formatDuration, formatRunTime } from "../../shared/run-times";
import { getTimeSpan } from "./step-runs";

import type { ItemCounts } from "../../shared/step-states";
import type { ItemRun } from "./step-runs";

/**
 * The lines under a step's state in its run's panel. `perItem` is whether its runs are a for-each step's items, which
 * are counted rather than the attempts of one run.
 */
export const getStatusLines = ({
  runs,
  perItem,
  running,
  waitingOnPerson,
  now,
}: {
  runs: ItemRun[];
  perItem: boolean;
  /** Still running, so timed up to now, though its runs so far may all have closed. */
  running: boolean;
  waitingOnPerson: boolean;
  now: Date;
}): string[] => {
  const { startedAt, closedAt } = getTimeSpan(runs);
  const lines: string[] = [];

  if (startedAt) {
    const start = new Date(startedAt);
    const end = closedAt && !running ? new Date(closedAt) : now;

    lines.push(
      `${formatDuration(end.getTime() - start.getTime())} · ${formatRunTime(start, now)}`,
    );
  } else {
    /* Scheduled but not started, or skipped. */
    const [first] = runs;

    if (first) {
      lines.push(formatRunTime(new Date(first.stepRun.scheduledAt), now));
    }
  }

  if (perItem) {
    /* A for-each step's runs are its steps', so an item can have several. */
    const retried = new Set(
      runs.flatMap(({ itemIndex, stepRun }) =>
        stepRun.attempt > 1 ? [itemIndex] : [],
      ),
    ).size;

    if (retried > 0) {
      lines.push(`${retried} ${retried === 1 ? "item" : "items"} retried`);
    }
  } else {
    const attempts = runs[0]?.stepRun.attempt ?? 0;

    if (attempts > 1) {
      lines.push(`${attempts} attempts`);
    }
  }

  if (waitingOnPerson) {
    lines.push("Waiting on a person to answer");
  }

  return lines;
};

/**
 * How a for-each step's items, or a step's runs for them, have gone so far, e.g. "18 of 20 items done · 2 failed".
 * `null` while there are none: the step wasn't reached, was skipped, or had no items.
 */
export const getItemCountsLine = (items: ItemCounts): string | null => {
  const total = Object.values(items).reduce((sum, count) => sum + count, 0);

  if (total === 0) {
    return null;
  }
  const done = `${items.done} of ${total} ${total === 1 ? "item" : "items"} done`;

  return items.failed > 0 ? `${done} · ${items.failed} failed` : done;
};
