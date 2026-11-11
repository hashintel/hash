import { FlowRunStatus } from "../../../../../../../graphql/api-types.gen";

import type { FlowRunSummary } from "../../../../../../../graphql/api-types.gen";

/** How the Logs tab shows a run's status, finer than the API's where it helps, e.g. a run waiting on a person. */
export type RunState =
  | "running"
  | "needsReview"
  | "completed"
  | "failed"
  | "timedOut"
  | "cancelled"
  | "unknown";

export type RunTab = "all" | "running" | "completed" | "failed";

/*
 * The older runs table (`pages/shared/flow-tables/flow-run-status.ts`) maps the same statuses more coarsely, with no
 * "needs review" and unknown ones as errored. The two should merge once that table is replaced.
 */
const stateOfStatus: Record<FlowRunStatus, RunState> = {
  [FlowRunStatus.Running]: "running",
  /* The run carries on in a fresh execution with the same parameters, so it's still going. */
  [FlowRunStatus.ContinuedAsNew]: "running",
  [FlowRunStatus.Completed]: "completed",
  [FlowRunStatus.Failed]: "failed",
  [FlowRunStatus.TimedOut]: "timedOut",
  [FlowRunStatus.Cancelled]: "cancelled",
  [FlowRunStatus.Terminated]: "cancelled",
  [FlowRunStatus.Unknown]: "unknown",
  [FlowRunStatus.Unspecified]: "unknown",
};

export const getRunState = ({
  status,
  openInputRequests,
}: Pick<FlowRunSummary, "status" | "openInputRequests">): RunState => {
  const state = stateOfStatus[status];

  /* Requests for web pages are answered by the browser plugin, not a person, so only questions need review. */
  return state === "running" &&
    openInputRequests.some(({ type }) => type === "human-input")
    ? "needsReview"
    : state;
};

/**
 * Each state's name, and the tab it counts in, in the order a status sort puts them: the ones that need a look first.
 * A run whose status is unknown is in no tab but All, rather than counted as a failure it may not be.
 */
export const runStates: Record<
  RunState,
  { label: string; tab: Exclude<RunTab, "all"> | null }
> = {
  failed: { label: "Failed", tab: "failed" },
  timedOut: { label: "Timed out", tab: "failed" },
  cancelled: { label: "Cancelled", tab: "failed" },
  unknown: { label: "Unknown", tab: null },
  needsReview: { label: "Needs review", tab: "running" },
  running: { label: "Running", tab: "running" },
  completed: { label: "Done", tab: "completed" },
};

export const runStatesByUrgency = Object.keys(runStates) as RunState[];
