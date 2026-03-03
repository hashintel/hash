import { useQuery } from "@apollo/client";
import {
  getFlowRunById,
  getFlowRunsQuery,
} from "@local/hash-isomorphic-utils/graphql/queries/flow.queries";
import type { PropsWithChildren } from "react";
import { createContext, useContext, useMemo } from "react";
import { useNodeId } from "reactflow";

import type {
  FlowRun,
  GetFlowRunByIdQuery,
  GetFlowRunByIdQueryVariables,
  GetFlowRunsQuery,
  GetFlowRunsQueryVariables,
  StepRun,
} from "../../graphql/api-types.gen";
import { FlowRunStatus, FlowStepStatus } from "../../graphql/api-types.gen";

export type FlowRunsPaginationState = {
  page: number;
  rowsPerPage: number;
  onPageChange: (newPage: number) => void;
  onRowsPerPageChange: (newRowsPerPage: number) => void;
};

export type FlowRunsContextType = {
  flowRuns: GetFlowRunsQuery["getFlowRuns"]["flowRuns"];
  totalCount: number;
  loading: boolean;
  pagination: FlowRunsPaginationState | null;
  selectedFlowRun: FlowRun | null;
  selectedFlowRunId: string | null;
};

export const FlowRunsContext = createContext<FlowRunsContextType | null>(null);

export const FlowRunsContextProvider = ({
  children,
  pagination,
  selectedFlowRunId,
}: PropsWithChildren<{
  pagination?: FlowRunsPaginationState;
  selectedFlowRunId: string | null;
}>) => {
  const variables: GetFlowRunsQueryVariables = pagination
    ? {
        offset: pagination.page * pagination.rowsPerPage,
        limit: pagination.rowsPerPage,
      }
    : { offset: 0, limit: 50 };

  const { data: flowRunsData, loading: flowRunsLoading } = useQuery<
    GetFlowRunsQuery,
    GetFlowRunsQueryVariables
  >(getFlowRunsQuery, {
    pollInterval: 3_000,
    variables,
  });

  const { data: selectedFlowRunData, loading: selectedFlowRunLoading } =
    useQuery<GetFlowRunByIdQuery, GetFlowRunByIdQueryVariables>(
      getFlowRunById,
      {
        pollInterval: 2_000,
        skip: !selectedFlowRunId,
        variables: {
          flowRunId: selectedFlowRunId ?? "",
        },
      },
    );

  const flowRuns = useMemo(() => {
    if (flowRunsData) {
      return flowRunsData.getFlowRuns.flowRuns;
    }
    return [];
  }, [flowRunsData]);

  const totalCount = flowRunsData?.getFlowRuns.totalCount ?? 0;

  const selectedFlowRun = useMemo(() => {
    if (selectedFlowRunData) {
      return selectedFlowRunData.getFlowRunById;
    }
    return null;
  }, [selectedFlowRunData]);

  const context = useMemo<FlowRunsContextType>(
    () => ({
      flowRuns,
      totalCount,
      loading: selectedFlowRunLoading || flowRunsLoading,
      pagination: pagination ?? null,
      selectedFlowRun,
      selectedFlowRunId,
    }),
    [
      flowRuns,
      totalCount,
      flowRunsLoading,
      pagination,
      selectedFlowRunLoading,
      selectedFlowRun,
      selectedFlowRunId,
    ],
  );

  return (
    <FlowRunsContext.Provider value={context}>
      {children}
    </FlowRunsContext.Provider>
  );
};

export const useFlowRunsContext = () => {
  const flowRunsContext = useContext(FlowRunsContext);

  if (!flowRunsContext) {
    throw new Error("no FlowRunsContext value has been provided");
  }

  return flowRunsContext;
};

export type StepRunStatus = Pick<
  StepRun,
  "inputs" | "outputs" | "status" | "closedAt" | "scheduledAt" | "logs"
>;

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

    return selectedFlowRun.steps.find((step) => step.stepId === nodeId) ?? null;
  }, [selectedFlowRun, nodeId]);
};

export const useStatusForCurrentStep = (): StepRunStatus | null => {
  const nodeId = useNodeId();

  return useStatusForStep(nodeId);
};

export type SimpleStatus =
  | "Waiting"
  | "Information Required"
  | "In Progress"
  | "Complete"
  | "Errored"
  | "Cancelled";

export const statusToSimpleStatus = (
  status: StepRun["status"] | null,
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
  }

  return simpleStatus;
};

export const useStatusForSteps = (
  steps: { stepId: string }[],
): {
  closedAt?: string;
  scheduledAt?: string;
  overallStatus: SimpleStatus;
  statusByStep: Record<string, SimpleStatus>;
} | null => {
  const { selectedFlowRun } = useFlowRunsContext();

  return useMemo(() => {
    const statusByStep: Record<string, SimpleStatus> = {};

    if (!selectedFlowRun) {
      return null;
    }

    const stepRuns = selectedFlowRun.steps.filter((stepRun) =>
      steps.find((step) => step.stepId === stepRun.stepId),
    );

    const flowCompletedUnsuccessfully =
      selectedFlowRun.closedAt &&
      selectedFlowRun.status !== FlowRunStatus.Completed;

    if (stepRuns.length === 0) {
      return {
        overallStatus: flowCompletedUnsuccessfully ? "Cancelled" : "Waiting",
        statusByStep,
      };
    }

    let scheduledAt: string | undefined;
    let closedAt: string | undefined;
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

      if (stepRun.closedAt && (!closedAt || stepRun.closedAt > closedAt)) {
        closedAt = stepRun.closedAt;
      }

      let simpleStatus = statusToSimpleStatus(stepRun.status);

      if (
        selectedFlowRun.closedAt &&
        ["In Progress", "Waiting", "Information Required"].includes(
          simpleStatus,
        )
      ) {
        simpleStatus = "Cancelled";
      }

      statusByStep[stepRun.stepId] = simpleStatus;

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
      closedAt,
      scheduledAt,
      overallStatus: status,
      statusByStep,
    };
  }, [selectedFlowRun, steps]);
};
