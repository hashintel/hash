import type { EntityUuid } from "@blockprotocol/type-system";
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
import { inferMetadataFromDocumentFlowDefinition } from "@local/hash-isomorphic-utils/flows/file-flow-definitions";
import { configureDashboardItemFlowDefinition } from "@local/hash-isomorphic-utils/flows/frontend-flow-definitions";
import {
  goalFlowDefinition,
  goalFlowDefinitionWithReportAndSpreadsheetDeliverable,
  goalFlowDefinitionWithReportDeliverable,
  goalFlowDefinitionWithSpreadsheetDeliverable,
} from "@local/hash-isomorphic-utils/flows/goal-flow-definitions";
import {
  historicalFlightsFlowDefinition,
  scheduledFlightsFlowDefinition,
} from "@local/hash-isomorphic-utils/flows/integration-flow-definitions";
import type {
  FlowActionDefinitionId,
  FlowDefinition,
} from "@local/hash-isomorphic-utils/flows/types";
import type { PropsWithChildren } from "react";
import { createContext, useContext, useMemo, useState } from "react";

export type FlowDefinitionsContextType = {
  flowDefinitions: FlowDefinition<FlowActionDefinitionId>[];
  selectedFlowDefinitionId: EntityUuid | null;
};

export const FlowDefinitionsContext =
  createContext<FlowDefinitionsContextType | null>(null);

const exampleFlows: FlowDefinition<FlowActionDefinitionId>[] = [
  researchTaskFlowDefinition,
  researchEntitiesFlowDefinition,
  ftseInvestorsFlowDefinition,
  inferMetadataFromDocumentFlowDefinition,
  inferUserEntitiesFromWebPageFlowDefinition,
  answerQuestionFlow,
  saveFileFromUrl,
  manualBrowserInferenceFlowDefinition,
  automaticBrowserInferenceFlowDefinition,
  goalFlowDefinition,
  goalFlowDefinitionWithReportDeliverable,
  goalFlowDefinitionWithSpreadsheetDeliverable,
  goalFlowDefinitionWithReportAndSpreadsheetDeliverable,
  scheduledFlightsFlowDefinition,
  historicalFlightsFlowDefinition,
  configureDashboardItemFlowDefinition,
];

export const FlowDefinitionsContextProvider = ({
  children,
  selectedFlowDefinitionId,
}: PropsWithChildren<{ selectedFlowDefinitionId: EntityUuid | null }>) => {
  const [flowDefinitions, setFlowDefinitions] =
    useState<FlowDefinition<FlowActionDefinitionId>[]>(exampleFlows);

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
