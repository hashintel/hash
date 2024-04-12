import type { PropsWithChildren } from "react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  FlowRun,
  FlowStepStatus,
  GetFlowRunsQuery,
  GetFlowRunsQueryVariables,
  StepRun,
} from "../../../../graphql/api-types.gen";
import { useNodeId } from "reactflow";
import { useQuery } from "@apollo/client";
import { getFlowRunsQuery } from "@local/hash-isomorphic-utils/graphql/queries/flow.queries";

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
    }
  }, [data]);

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

export const useStatusForStep = (): Pick<
  StepRun,
  "inputs" | "outputs" | "status" | "closedAt" | "scheduledAt"
> | null => {
  const { selectedFlowRun } = useFlowRunsContext();

  const nodeId = useNodeId();

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
};
