import { createContext, useContext } from "react";

import type { EntityUuid } from "@blockprotocol/type-system";
import type {
  FlowActionDefinitionId,
  FlowDefinition,
} from "@local/hash-isomorphic-utils/flows/types";

export type FlowDefinitionsContextType = {
  flowDefinitions: FlowDefinition<FlowActionDefinitionId>[];
  selectedFlowDefinitionId: EntityUuid | null;
};

export const FlowDefinitionsContext =
  createContext<FlowDefinitionsContextType | null>(null);

export const useFlowDefinitionsContext = () => {
  const flowDefinitionsContext = useContext(FlowDefinitionsContext);

  if (!flowDefinitionsContext) {
    throw new Error("no FlowDefinitionsContext value has been provided");
  }

  return flowDefinitionsContext;
};
