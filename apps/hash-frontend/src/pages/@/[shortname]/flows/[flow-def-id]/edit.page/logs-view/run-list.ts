import { getShortRunId } from "./run-id";
import { getRunState, runStates, runStatesByUrgency } from "./run-state";

import type { FlowRunSummary } from "../../../../../../../graphql/api-types.gen";
import type { RunState, RunTab } from "./run-state";
import type { EntityId } from "@blockprotocol/type-system";
import type { SortDirection } from "@hashintel/ds-components";

export type RunTrigger = "manual" | "scheduled";

/** A run as the table shows it. */
export type RunRow = {
  flowRunEntityId: EntityId;
  shortId: string;
  state: RunState;
  trigger: RunTrigger;
  startedAt: Date;
  /** `null` while the run hasn't ended. */
  endedAt: Date | null;
  /** The shortname of the web the run is in, or `null` if it isn't one of the user's. */
  webShortname: string | null;
};

export type RunSummary = Pick<
  FlowRunSummary,
  | "flowRunEntityId"
  | "flowScheduleId"
  | "webId"
  | "status"
  | "startedAt"
  | "closedAt"
  | "openInputRequests"
>;

export const toRunRow = (
  run: RunSummary,
  webShortname: string | null,
): RunRow => ({
  flowRunEntityId: run.flowRunEntityId,
  shortId: getShortRunId(run.flowRunEntityId),
  state: getRunState(run),
  trigger: run.flowScheduleId ? "scheduled" : "manual",
  startedAt: new Date(run.startedAt),
  endedAt: run.closedAt ? new Date(run.closedAt) : null,
  webShortname,
});

/** How long a run took, or has taken so far while it runs. `null` for a run that stopped with no end recorded. */
export const getRunDuration = (row: RunRow, now: Date) => {
  if (row.endedAt) {
    return row.endedAt.getTime() - row.startedAt.getTime();
  }

  return runStates[row.state].tab === "running"
    ? now.getTime() - row.startedAt.getTime()
    : null;
};

/** Which runs to show. An empty list of states matches every state, and a `null` trigger every trigger. */
export type RunFilters = { states: RunState[]; trigger: RunTrigger | null };

export const filterRuns = (rows: RunRow[], { states, trigger }: RunFilters) =>
  rows.filter(
    (row) =>
      (states.length === 0 || states.includes(row.state)) &&
      (trigger === null || row.trigger === trigger),
  );

export const isInTab = (row: RunRow, tab: RunTab) =>
  tab === "all" || runStates[row.state].tab === tab;

export const countRunsByTab = (rows: RunRow[]): Record<RunTab, number> => {
  const counts = { all: rows.length, running: 0, completed: 0, failed: 0 };

  for (const row of rows) {
    const { tab } = runStates[row.state];

    if (tab) {
      counts[tab] += 1;
    }
  }

  return counts;
};

export type RunSortKey =
  | "id"
  | "status"
  | "started"
  | "ended"
  | "duration"
  | "web";

export type RunSort = { key: RunSortKey; direction: SortDirection };

export const defaultRunSort: RunSort = {
  key: "started",
  direction: "DESCENDING",
};

const compareInAscendingOrder = (
  key: RunSortKey,
  a: RunRow,
  b: RunRow,
  now: Date,
) => {
  switch (key) {
    case "id":
      return a.shortId.localeCompare(b.shortId);
    case "status":
      return (
        runStatesByUrgency.indexOf(a.state) -
        runStatesByUrgency.indexOf(b.state)
      );
    case "started":
      return a.startedAt.getTime() - b.startedAt.getTime();
    case "ended": {
      /* A run that hasn't ended will end after every run that has. */
      const endOf = (row: RunRow) =>
        row.endedAt?.getTime() ?? Number.MAX_SAFE_INTEGER;

      return endOf(a) - endOf(b);
    }
    case "duration":
      /* A run with no duration sorts as the shortest. */
      return (getRunDuration(a, now) ?? -1) - (getRunDuration(b, now) ?? -1);
    case "web":
      return (a.webShortname ?? "").localeCompare(b.webShortname ?? "");
  }
};

/** Sorts the runs, putting the newest first among runs that sort the same. */
export const sortRuns = (rows: RunRow[], sort: RunSort, now: Date) =>
  rows.toSorted(
    (a, b) =>
      (sort.direction === "ASCENDING" ? 1 : -1) *
        compareInAscendingOrder(sort.key, a, b, now) ||
      b.startedAt.getTime() - a.startedAt.getTime() ||
      a.shortId.localeCompare(b.shortId),
  );
