import { getShortRunId } from "../../shared/run-id";
import { compareNewestFirst } from "../../shared/run-times";

import type { RunSummary } from "../../shared/use-flow-runs";
import type { EntityId } from "@blockprotocol/type-system";

/** How many of the flow's newest runs the run menu lists. */
const menuRunCount = 6;

/**
 * The runs the run switcher offers for the open run. The menu lists the flow's six newest, and the open run too if
 * it's older. ‹ opens the next older run and › the next newer, each `null` at its end of the list, and both `null`
 * while the open run isn't among the flow's runs, e.g. one of another flow.
 *
 * `openRun` is the open run as the run view last read it, `null` until then or if it's of another flow. It's read
 * more often than `runs`, so it takes the place of its entry there, and joins them if they don't have it yet, as
 * for a run just started.
 */
export const getSwitcherRuns = (
  runs: RunSummary[],
  flowRunEntityId: EntityId,
  openRun: RunSummary | null,
) => {
  const newestFirst = (
    openRun
      ? [
          ...runs.filter(
            (run) => run.flowRunEntityId !== openRun.flowRunEntityId,
          ),
          openRun,
        ]
      : runs
  )
    .map((run) => ({
      run,
      startedAt: new Date(run.startedAt),
      shortId: getShortRunId(run.flowRunEntityId),
    }))
    .toSorted(compareNewestFirst)
    .map(({ run }) => run);
  const openIndex = newestFirst.findIndex(
    (run) => run.flowRunEntityId === flowRunEntityId,
  );

  return {
    menuRuns: newestFirst.filter(
      (_run, index) => index < menuRunCount || index === openIndex,
    ),
    older: openIndex < 0 ? null : (newestFirst[openIndex + 1] ?? null),
    newer: openIndex < 1 ? null : (newestFirst[openIndex - 1] ?? null),
  };
};
