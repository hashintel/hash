import { createContext, useContext, useMemo } from "react";

import { parseStepRunId } from "@local/hash-isomorphic-utils/flows/step-run-id";
import { FlowStepStatus } from "@local/hash-isomorphic-utils/graphql/api-types.gen";

import { FlowRunStatus } from "../../graphql/api-types.gen";

import type {
  GetFlowRunByIdQuery,
  GetFlowRunsQuery,
} from "../../graphql/api-types.gen";
import type { EntityId } from "@blockprotocol/type-system";
import type { FlowRunStepRunState } from "@local/hash-isomorphic-utils/flows/step-runs";
import type { ExternalInputRequest } from "@local/hash-isomorphic-utils/flows/types";

export type FlowRunsPaginationState = {
  currentCursor: string | null;
  previousCursors: string[];
  rowsPerPage: number;
  onNextPage: (nextCursor: string) => void;
  onPreviousPage: () => void;
};

/** The run being viewed, with its step runs and input requests from its events. */
export type SelectedFlowRun = GetFlowRunByIdQuery["getFlowRunById"] & {
  stepRuns: FlowRunStepRunState[];
  inputRequests: ExternalInputRequest[];
};

export type FlowRunsContextType = {
  flowRuns: GetFlowRunsQuery["getFlowRuns"]["flowRuns"];
  totalCount: number;
  nextCursor: string | null;
  loading: boolean;
  pagination: FlowRunsPaginationState | null;
  selectedFlowRun: SelectedFlowRun | null;
  selectedFlowRunEntityId: EntityId | null;
  /** Why the selected run's events couldn't be read or shown, or why the last check for new ones failed. */
  selectedFlowRunEventsFailure: string | null;
};

export const FlowRunsContext = createContext<FlowRunsContextType | null>(null);

export const useFlowRunsContext = () => {
  const flowRunsContext = useContext(FlowRunsContext);

  if (!flowRunsContext) {
    throw new Error("no FlowRunsContext value has been provided");
  }

  return flowRunsContext;
};

export type StepRunStatus = Pick<
  FlowRunStepRunState,
  "status" | "closedAt" | "scheduledAt"
>;

export type SimpleStatus =
  | "Waiting"
  | "Information Required"
  | "In Progress"
  | "Complete"
  | "Errored"
  | "Cancelled"
  | "Skipped";

export const statusToSimpleStatus = (
  status: FlowStepStatus | null,
): SimpleStatus => {
  let simpleStatus: SimpleStatus = "Waiting";

  switch (status) {
    case FlowStepStatus.Completed:
      simpleStatus = "Complete";
      break;
    case FlowStepStatus.Failed:
    case FlowStepStatus.TimedOut:
      simpleStatus = "Errored";
      break;
    case FlowStepStatus.Cancelled:
      simpleStatus = "Cancelled";
      break;
    case FlowStepStatus.Scheduled:
    case FlowStepStatus.Started:
      simpleStatus = "In Progress";
      break;
    case FlowStepStatus.InformationRequired:
      simpleStatus = "Information Required";
      break;
    case FlowStepStatus.Skipped:
      simpleStatus = "Skipped";
      break;
  }

  return simpleStatus;
};

/**
 * The id of the step in the flow definition that a step run is of. The engine runs the steps inside a `for-each` once
 * per item, each with its own step run id.
 */
const getDefinitionStepId = (stepRunId: string) =>
  parseStepRunId(stepRunId).stepId;

/**
 * The status shown for a step that has several runs, as a step inside a `for-each` does: the first in this list that
 * any of its runs has.
 */
const statusPrecedence: SimpleStatus[] = [
  "Errored",
  "Information Required",
  "In Progress",
  "Waiting",
  "Cancelled",
  "Complete",
  "Skipped",
];

const combineStatuses = (
  status: SimpleStatus | undefined,
  otherStatus: SimpleStatus,
): SimpleStatus =>
  status !== undefined &&
  statusPrecedence.indexOf(status) <= statusPrecedence.indexOf(otherStatus)
    ? status
    : otherStatus;

/**
 * The run of a step, or for a step inside a `for-each`, the run of it whose status is shown (see `statusPrecedence`).
 */
export const getShownStepRun = <Run extends StepRunStatus & { stepId: string }>(
  stepRuns: Run[],
  stepId: string,
): Run | null =>
  stepRuns
    .filter((stepRun) => getDefinitionStepId(stepRun.stepId) === stepId)
    .reduce<Run | null>(
      (shownStepRun, stepRun) =>
        !shownStepRun ||
        statusPrecedence.indexOf(statusToSimpleStatus(stepRun.status)) <
          statusPrecedence.indexOf(statusToSimpleStatus(shownStepRun.status))
          ? stepRun
          : shownStepRun,
      null,
    );

export const useStatusForStep = (
  nodeId: string | null,
): StepRunStatus | null => {
  const { selectedFlowRun } = useFlowRunsContext();

  return useMemo(() => {
    if (!selectedFlowRun || !nodeId) {
      return null;
    }

    if (nodeId === "trigger") {
      return null;
    }

    return getShownStepRun(selectedFlowRun.stepRuns, nodeId);
  }, [selectedFlowRun, nodeId]);
};

type StepsStatus = {
  closedAt?: string;
  scheduledAt?: string;
  overallStatus: SimpleStatus;
  statusByStep: Record<string, SimpleStatus>;
};

/**
 * The status of each of `steps` in a flow run, and of them together. A step inside a `for-each` (`parentStepId`) has a
 * run per item: those count towards it and towards the `for-each`, which has no run of its own.
 */
export const getStatusForSteps = (
  flowRun: Pick<SelectedFlowRun, "closedAt" | "status" | "stepRuns">,
  steps: { stepId: string; parentStepId?: string }[],
): StepsStatus => {
  const statusByStep: Record<string, SimpleStatus> = {};

  const stepsById = new Map(steps.map((step) => [step.stepId, step]));

  const stepRuns = flowRun.stepRuns.filter((stepRun) =>
    stepsById.has(getDefinitionStepId(stepRun.stepId)),
  );

  const flowCompletedUnsuccessfully =
    flowRun.closedAt && flowRun.status !== FlowRunStatus.Completed;

  if (stepRuns.length === 0) {
    return {
      overallStatus: flowCompletedUnsuccessfully ? "Cancelled" : "Waiting",
      statusByStep,
    };
  }

  let scheduledAt: string | undefined;
  let latestClosedAt: string | undefined;
  let allStepsClosed = true;
  let status: SimpleStatus =
    stepRuns.at(-1)!.status === FlowStepStatus.Cancelled
      ? "Cancelled"
      : "Complete";

  let hasError: boolean = false;
  let hasWaiting: boolean = false;
  let hasInProgress: boolean = false;

  for (const stepRun of stepRuns) {
    if (!scheduledAt || stepRun.scheduledAt < scheduledAt) {
      scheduledAt = stepRun.scheduledAt;
    }

    if (stepRun.closedAt) {
      if (!latestClosedAt || stepRun.closedAt > latestClosedAt) {
        latestClosedAt = stepRun.closedAt;
      }
    } else {
      allStepsClosed = false;
    }

    let simpleStatus = statusToSimpleStatus(stepRun.status);

    if (
      flowRun.closedAt &&
      ["In Progress", "Waiting", "Information Required"].includes(simpleStatus)
    ) {
      simpleStatus = "Cancelled";
    }

    const step = stepsById.get(getDefinitionStepId(stepRun.stepId))!;

    for (const stepId of [step.stepId, step.parentStepId]) {
      if (stepId !== undefined) {
        statusByStep[stepId] = combineStatuses(
          statusByStep[stepId],
          simpleStatus,
        );
      }
    }

    if (simpleStatus === "Errored") {
      hasError = true;
    } else if (
      simpleStatus === "In Progress" ||
      simpleStatus === "Information Required"
    ) {
      hasInProgress = true;
    } else if (simpleStatus === "Waiting") {
      hasWaiting = true;
    }
  }

  if (hasError) {
    status = "Errored";
  } else if (hasInProgress) {
    status = "In Progress";
  } else if (hasWaiting) {
    status = "Waiting";
  }

  if (flowCompletedUnsuccessfully) {
    status = "Cancelled";
  }

  return {
    closedAt: allStepsClosed ? latestClosedAt : undefined,
    scheduledAt,
    overallStatus: status,
    statusByStep,
  };
};

export const useStatusForSteps = (
  steps: { stepId: string; parentStepId?: string }[],
): StepsStatus | null => {
  const { selectedFlowRun } = useFlowRunsContext();

  return useMemo(
    () => (selectedFlowRun ? getStatusForSteps(selectedFlowRun, steps) : null),
    [selectedFlowRun, steps],
  );
};
