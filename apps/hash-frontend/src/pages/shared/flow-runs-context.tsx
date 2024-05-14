import { useQuery } from "@apollo/client";
import { getFlowRunsQuery } from "@local/hash-isomorphic-utils/graphql/queries/flow.queries";
import type { PropsWithChildren } from "react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useNodeId } from "reactflow";

import type {
  FlowRun,
  GetFlowRunsQuery,
  GetFlowRunsQueryVariables,
  StepRun,
} from "../../graphql/api-types.gen";
import { FlowStepStatus } from "../../graphql/api-types.gen";

export type FlowRunsContextType = {
  flowRuns: FlowRun[];
  setFlowRuns: (flowRuns: FlowRun[]) => void;
  selectedFlowRun: FlowRun | null;
  selectedFlowRunId: string | null;
  setSelectedFlowRunId: (workflowId: string | null) => void;
};

export const FlowRunsContext = createContext<FlowRunsContextType | null>(null);

export const FlowRunsContextProvider = ({ children }: PropsWithChildren) => {
  const [flowRuns, setFlowRuns] = useState<FlowRun[]>([]);
  const [selectedFlowRunId, setSelectedFlowRunId] = useState<string | null>(
    null,
  );

  const { data } = useQuery<GetFlowRunsQuery, GetFlowRunsQueryVariables>(
    getFlowRunsQuery,
    {
      pollInterval: 3_000,
    },
  );

  useEffect(() => {
    if (data) {
      setFlowRuns(data.getFlowRuns);
    }
  }, [data]);

  const context = useMemo<FlowRunsContextType>(
    () => ({
      flowRuns,
      setFlowRuns,
      selectedFlowRun:
        flowRuns.find((flowRun) => flowRun.workflowId === selectedFlowRunId) ??
        null,
      selectedFlowRunId,
      setSelectedFlowRunId,
    }),
    [flowRuns, selectedFlowRunId],
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

type StepRunStatus = Pick<
  StepRun,
  "inputs" | "outputs" | "status" | "closedAt" | "scheduledAt"
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
      return {
        closedAt: selectedFlowRun.startedAt,
        outputs: selectedFlowRun.inputs[0].flowTrigger.outputs,
        scheduledAt: selectedFlowRun.startedAt,
        status: FlowStepStatus.Completed,
      };
    }

    return selectedFlowRun.steps.find((step) => step.stepId === nodeId) ?? null;
  }, [selectedFlowRun, nodeId]);
};

export const useStatusForCurrentStep = (): Pick<
  StepRun,
  "inputs" | "outputs" | "status" | "closedAt" | "scheduledAt"
> | null => {
  const nodeId = useNodeId();

  return useStatusForStep(nodeId);
};

export type SimpleStatus =
  | "Waiting"
  | "In Progress"
  | "Complete"
  | "Error"
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
      simpleStatus = "Error";
      break;
    case FlowStepStatus.Cancelled:
      simpleStatus = "Cancelled";
      break;
    case FlowStepStatus.Scheduled:
    case FlowStepStatus.Started:
      simpleStatus = "In Progress";
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

    if (stepRuns.length === 0) {
      return {
        overallStatus: "Waiting",
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

      const simpleStatus = statusToSimpleStatus(stepRun.status);

      statusByStep[stepRun.stepId] = simpleStatus;

      if (simpleStatus === "Error") {
        hasError = true;
      } else if (simpleStatus === "In Progress") {
        hasInProgress = true;
      } else if (simpleStatus === "Waiting") {
        hasWaiting = true;
      }
    }

    if (hasError) {
      status = "Error";
    } else if (hasInProgress) {
      status = "In Progress";
    } else if (hasWaiting) {
      status = "Waiting";
    }

    return {
      closedAt,
      scheduledAt,
      overallStatus: status,
      statusByStep,
    };
  }, [selectedFlowRun, steps]);
};
