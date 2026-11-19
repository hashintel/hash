import { FlowStepStatus } from "@local/hash-isomorphic-utils/graphql/api-types.gen";

import { formatDuration, formatRunTime } from "../../shared/run-times";
import { getShownState, stepStateLabels } from "../../shared/step-states";
import { getTimeSpan } from "./step-runs";

import type {
  ItemCounts,
  StepRunMark,
  StepState,
} from "../../shared/step-states";
import type { ItemRun } from "./step-runs";

/** A step's status in its run's panel: one line of its mark, its word and the facts after it, then quiet lines. */
export type StatusLine = {
  state: StepState;
  word: string;
  /** Its items' count, then how long it took and when it started, or when it asked a person. */
  facts: string[];
  /** Only for a reason: it was retried, it's waiting on a person, or why it failed. */
  notes: string[];
};

export const getItemTotal = (items: ItemCounts) =>
  Object.values(items).reduce((sum, count) => sum + count, 0);

/**
 * How a step's items have gone, beside its word: how many have finished while it runs, e.g. "12 of 20", and once it
 * has, how many failed, or else were skipped, e.g. "2 of 20 failed". With no noun, so its line fits the panel. `null`
 * when there's nothing to count.
 */
export const getItemCount = (
  state: StepState,
  items: ItemCounts,
): string | null => {
  const total = getItemTotal(items);

  if (total === 0 || state === "needsReview") {
    return null;
  }

  if (state === "running") {
    return `${items.done + items.failed + items.skipped} of ${total}`;
  }

  if (items.failed > 0) {
    return `${items.failed} of ${total} failed`;
  }

  return items.skipped > 0 ? `${items.skipped} of ${total} skipped` : null;
};

/**
 * A step's status line and the quiet lines under it. `perItem` is whether its runs are a for-each step's items, which
 * are counted rather than the attempts of one run.
 */
export const getStatusLine = ({
  mark,
  live,
  runs,
  perItem,
  running,
  askedAt,
  now,
}: {
  mark: StepRunMark;
  /** Whether its run is still going. */
  live: boolean;
  runs: ItemRun[];
  perItem: boolean;
  /** Still running, so timed up to now, though its runs so far may all have closed. */
  running: boolean;
  /** When it asked a person the questions it's waiting on them to answer, if it is. */
  askedAt: string | null;
  now: Date;
}): StatusLine => {
  const state = getShownState(mark.state, live);
  const count = mark.items && getItemCount(state, mark.items);
  const { startedAt, closedAt } = getTimeSpan(runs);
  const start = startedAt ? new Date(startedAt) : null;
  const duration =
    start &&
    formatDuration(
      (closedAt && !running ? new Date(closedAt) : now).getTime() -
        start.getTime(),
    );

  const facts = count ? [count] : [];

  if (askedAt && state === "needsReview") {
    facts.push(`Asked ${formatRunTime(new Date(askedAt), now)}`);
  } else if (start && duration) {
    facts.push(duration, formatRunTime(start, now));
  } else {
    /* Scheduled but not started, or skipped. */
    const [first] = runs;

    if (first) {
      facts.push(formatRunTime(new Date(first.stepRun.scheduledAt), now));
    }
  }

  const notes: string[] = [];

  if (perItem) {
    /* A for-each step's runs are its steps', so an item can have several. */
    const retried = new Set(
      runs.flatMap(({ itemIndex, stepRun }) =>
        stepRun.attempt > 1 ? [itemIndex] : [],
      ),
    ).size;

    if (retried > 0) {
      notes.push(`${retried} ${retried === 1 ? "item" : "items"} retried`);
    }
  } else {
    const attempts = runs[0]?.stepRun.attempt ?? 0;

    if (attempts > 1) {
      notes.push(`${attempts} attempts`);
    }
  }

  if (askedAt) {
    notes.push("Waiting on a person to answer");
  }

  if (
    !perItem &&
    duration &&
    runs[0]?.stepRun.status === FlowStepStatus.TimedOut
  ) {
    notes.push(`Timed out after ${duration}`);
  }

  return { state, word: stepStateLabels[state], facts, notes };
};
