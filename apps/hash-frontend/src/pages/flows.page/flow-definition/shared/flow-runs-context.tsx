import exampleFlowStatus from "./flow-status.json";

import type { PropsWithChildren } from "react";
import { createContext, useContext, useMemo, useState } from "react";
import {
  FlowRun,
  FlowStepStatus,
  StepRun,
} from "../../../../graphql/api-types.gen";
import { useNodeId } from "reactflow";

export type FlowRunsContextType = {
  flowRuns: FlowRun[];
  setFlowRuns: (flowRuns: FlowRun[]) => void;
  selectedFlowRun: FlowRun | null;
  setSelectedFlowRun: (flow: FlowRun | null) => void;
};

export const FlowRunsContext = createContext<FlowRunsContextType | null>(null);
export const FlowRunsContextProvider = ({ children }: PropsWithChildren) => {
  const [flowRuns, setFlowRuns] = useState<FlowRun[]>([
    exampleFlowStatus as FlowRun,
  ]);
  const [selectedFlowRun, setSelectedFlowRun] = useState<FlowRun | null>(null);

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
  "inputs" | "outputs" | "status"
> | null => {
  const { selectedFlowRun } = useFlowRunsContext();

  const nodeId = useNodeId();

  if (!selectedFlowRun || !nodeId) {
    return null;
  }

  if (nodeId === "trigger") {
    return {
      outputs: selectedFlowRun.inputs[0].trigger.outputs,
      status: FlowStepStatus.Completed,
    };
  }

  return selectedFlowRun.steps.find((step) => step.stepId === nodeId) ?? null;
};
