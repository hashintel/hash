import { useQuery } from "@apollo/client";
import type { StepDefinition } from "@local/hash-isomorphic-utils/flows/types";
import { getFlowRunsQuery } from "@local/hash-isomorphic-utils/graphql/queries/flow.queries";
import type { PropsWithChildren } from "react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useNodeId } from "reactflow";

import type {
  FlowRun,
  GetFlowRunsQuery,
  GetFlowRunsQueryVariables,
  StepRun,
} from "../../../../graphql/api-types.gen";
import { FlowStepStatus } from "../../../../graphql/api-types.gen";

export type FlowRunsContextType = {
  flowRuns: FlowRun[];
  setFlowRuns: (flowRuns: FlowRun[]) => void;
  selectedFlowRun: FlowRun | null;
  setSelectedFlowRun: (flow: FlowRun | null) => void;
};

export const FlowRunsContext = createContext<FlowRunsContextType | null>(null);
export const FlowRunsContextProvider = ({ children }: PropsWithChildren) => {
  const [flowRuns, setFlowRuns] = useState<FlowRun[]>([]);
  const [selectedFlowRun, setSelectedFlowRun] = useState<FlowRun | null>(null);

  const { data } = useQuery<GetFlowRunsQuery, GetFlowRunsQueryVariables>(
    getFlowRunsQuery,
    {
      pollInterval: 1_000,
    },
  );

  useEffect(() => {
    if (data) {
      setFlowRuns(data.getFlowRuns);
      setSelectedFlowRun(
        data.getFlowRuns.find(
          (flowRun) => flowRun.runId === selectedFlowRun?.runId,
        ) ?? null,
      );
    }
  }, [data, selectedFlowRun?.runId]);

  const context = useMemo<FlowRunsContextType>(
    () => ({
      flowRuns,
      setFlowRuns,
      selectedFlowRun,
      setSelectedFlowRun,
    }),
    [flowRuns, selectedFlowRun],
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

export type SimpleStatus = "Waiting" | "In Progress" | "Complete" | "Error";

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
    case FlowStepStatus.Canceled:
      simpleStatus = "Error";
      break;
    case FlowStepStatus.Scheduled:
    case FlowStepStatus.Started:
      simpleStatus = "In Progress";
      break;
  }

  return simpleStatus;
};

export const useStatusForSteps = (steps: StepDefinition[]): SimpleStatus => {
  const { selectedFlowRun } = useFlowRunsContext();

  return useMemo(() => {
    const stepRuns = selectedFlowRun?.steps.filter((stepRun) =>
      steps.find((step) => step.stepId === stepRun.stepId),
    );

    const statuses = stepRuns?.map((stepRun) =>
      statusToSimpleStatus(stepRun.status),
    );

    if (!statuses || statuses.length === 0) {
      return "Waiting";
    }

    for (const status of statuses) {
      if (status === "Error") {
        return "Error";
      }
      if (status === "In Progress") {
        return "In Progress";
      }
      if (status === "Waiting") {
        return "Waiting";
      }
    }

    return "Complete";
  }, [selectedFlowRun?.steps, steps]);
};
