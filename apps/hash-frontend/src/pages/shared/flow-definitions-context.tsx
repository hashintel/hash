import type { EntityUuid } from "@local/hash-graph-types/entity";
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
import {
  goalFlowDefinition,
  goalFlowDefinitionWithReportDeliverable,
  goalFlowDefinitionWithSpreadsheetDeliverable,
} from "@local/hash-isomorphic-utils/flows/goal-flow-definitions";
import type { FlowDefinition } from "@local/hash-isomorphic-utils/flows/types";
import type { PropsWithChildren } from "react";
import { createContext, useContext, useMemo, useState } from "react";

export type FlowDefinitionsContextType = {
  flowDefinitions: FlowDefinition[];
  selectedFlowDefinitionId: EntityUuid | null;
};

export const FlowDefinitionsContext =
  createContext<FlowDefinitionsContextType | null>(null);

const exampleFlows: FlowDefinition[] = [
  researchTaskFlowDefinition,
  researchEntitiesFlowDefinition,
  ftseInvestorsFlowDefinition,
  inferUserEntitiesFromWebPageFlowDefinition,
  answerQuestionFlow,
  saveFileFromUrl,
  manualBrowserInferenceFlowDefinition,
  automaticBrowserInferenceFlowDefinition,
  goalFlowDefinition,
  goalFlowDefinitionWithReportDeliverable,
  goalFlowDefinitionWithSpreadsheetDeliverable,
];

export const FlowDefinitionsContextProvider = ({
  children,
  selectedFlowDefinitionId,
}: PropsWithChildren<{ selectedFlowDefinitionId: EntityUuid | null }>) => {
  const [flowDefinitions, setFlowDefinitions] =
    useState<FlowDefinition[]>(exampleFlows);

  const context = useMemo<FlowDefinitionsContextType>(
    () => ({
      flowDefinitions,
      setFlowDefinitions,
      selectedFlowDefinitionId,
    }),
    [flowDefinitions, selectedFlowDefinitionId],
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
