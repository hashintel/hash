import { createContext, useContext, useMemo } from "react";

import {
  automaticBrowserInferenceFlow,
  manualBrowserInferenceFlow,
} from "@local/hash-isomorphic-utils/flows/browser-plugin-flow-definitions";
import { inferMetadataFromDocumentFlow } from "@local/hash-isomorphic-utils/flows/file-flow-definitions";
import {
  configureDashboardItemFlow,
  refineDashboardItemFlow,
} from "@local/hash-isomorphic-utils/flows/frontend-flow-definitions";
import { ftseInvestorsFlow } from "@local/hash-isomorphic-utils/flows/ftse-investors-flow-definition";
import { goalFlow } from "@local/hash-isomorphic-utils/flows/goal-flow-definitions";
import {
  historicalFlightsFlow,
  scheduledFlightsFlow,
} from "@local/hash-isomorphic-utils/flows/integration-flow-definitions";

import type { EntityUuid } from "@blockprotocol/type-system";
import type { FlowDefinitionWithId } from "@local/hash-isomorphic-utils/flows/types";
import type { PropsWithChildren } from "react";

export type FlowDefinitionsContextType = {
  /** Every flow defined in code. */
  flowDefinitions: FlowDefinitionWithId[];
  loading: boolean;
  selectedFlowDefinitionId: EntityUuid | null;
};

export const FlowDefinitionsContext =
  createContext<FlowDefinitionsContextType | null>(null);

const flowsDefinedInCode: FlowDefinitionWithId[] = [
  goalFlow,
  manualBrowserInferenceFlow,
  automaticBrowserInferenceFlow,
  inferMetadataFromDocumentFlow,
  configureDashboardItemFlow,
  refineDashboardItemFlow,
  historicalFlightsFlow,
  scheduledFlightsFlow,
  ftseInvestorsFlow,
];

export const FlowDefinitionsContextProvider = ({
  children,
  selectedFlowDefinitionId,
}: PropsWithChildren<{ selectedFlowDefinitionId: EntityUuid | null }>) => {
  const context = useMemo<FlowDefinitionsContextType>(
    () => ({
      flowDefinitions: flowsDefinedInCode,
      loading: false,
      selectedFlowDefinitionId,
    }),
    [selectedFlowDefinitionId],
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
