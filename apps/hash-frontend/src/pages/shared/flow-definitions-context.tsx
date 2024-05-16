import {
  automaticBrowserInferenceFlowDefinition,
  manualBrowserInferenceFlowDefinition,
} from "@local/hash-isomorphic-utils/flows/browser-plugin-flow-definitions";
import {
  answerQuestionFlow,
  ftseInvestorsFlowDefinition,
  inferUserEntitiesFromWebPageFlowDefinition,
  researchEntitiesFlowDefinition,
  researchTaskFlowDefinition,
  saveFileFromUrl,
} from "@local/hash-isomorphic-utils/flows/example-flow-definitions";
import type { FlowDefinition } from "@local/hash-isomorphic-utils/flows/types";
import type { PropsWithChildren } from "react";
import { createContext, useContext, useMemo, useState } from "react";

export type FlowDefinitionsContextType = {
  flowDefinitions: FlowDefinition[];
  setFlowDefinitions: (flowDefinitions: FlowDefinition[]) => void;
  selectedFlow: FlowDefinition;
  setSelectedFlow: (flow: FlowDefinition) => void;
};

export const FlowDefinitionsContext =
  createContext<FlowDefinitionsContextType | null>(null);

const exampleFlows: FlowDefinition[] = [
  // ...dummyFlows,
  researchTaskFlowDefinition,
  researchEntitiesFlowDefinition,
  ftseInvestorsFlowDefinition,

  inferUserEntitiesFromWebPageFlowDefinition,
  answerQuestionFlow,
  saveFileFromUrl,
  manualBrowserInferenceFlowDefinition,
  automaticBrowserInferenceFlowDefinition,
];

export const FlowDefinitionsContextProvider = ({
  children,
}: PropsWithChildren) => {
  const [flowDefinitions, setFlowDefinitions] =
    useState<FlowDefinition[]>(exampleFlows);
  const [selectedFlow, setSelectedFlow] = useState(exampleFlows[0]!);

  const context = useMemo<FlowDefinitionsContextType>(
    () => ({
      flowDefinitions,
      setFlowDefinitions,
      selectedFlow,
      setSelectedFlow,
    }),
    [flowDefinitions, selectedFlow],
  );

  return (
    <FlowDefinitionsContext.Provider value={context}>
      {children}
    </FlowDefinitionsContext.Provider>
  );
};

export const useFlowDefinitionsContext = () => {
  const flowDefinitionsContext = useContext(FlowDefinitionsContext);

  if (!flowDefinitionsContext) {
    throw new Error("no FlowDefinitionsContext value has been provided");
  }

  return flowDefinitionsContext;
};
