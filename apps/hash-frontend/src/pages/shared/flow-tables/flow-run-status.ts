import { FlowRunStatus } from "../../../graphql/api-types.gen";

import type { FlowRun } from "../../../graphql/api-types.gen";

export type SimpleFlowRunStatus =
  | "Running"
  | "Completed"
  | "Abandoned"
  | "Errored";

export const flowRunStatusToStatusText = (
  status: FlowRun["status"],
): SimpleFlowRunStatus => {
  switch (status) {
    case FlowRunStatus.Running:
    case FlowRunStatus.ContinuedAsNew:
      return "Running";
    case FlowRunStatus.Completed:
      return "Completed";
    case FlowRunStatus.Cancelled:
    case FlowRunStatus.Terminated:
      return "Abandoned";
    case FlowRunStatus.Failed:
    case FlowRunStatus.TimedOut:
    case FlowRunStatus.Unknown:
    case FlowRunStatus.Unspecified:
      return "Errored";
  }
};
