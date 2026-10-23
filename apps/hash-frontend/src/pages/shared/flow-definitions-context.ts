import { createContext, useContext } from "react";

import type { LoadedFlowDefinition } from "./use-flow-definitions";
import type { EntityId } from "@blockprotocol/type-system";

export type FlowDefinitionsContextType = {
  /** The current edition of every flow definition the user can view, from the graph. */
  flowDefinitions: LoadedFlowDefinition[];
  loading: boolean;
  selectedFlowDefinitionEntityId: EntityId | null;
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
