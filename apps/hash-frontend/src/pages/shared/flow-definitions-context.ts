import { createContext, useContext } from "react";

import type { EntityUuid } from "@blockprotocol/type-system";
import type { FlowDefinitionWithId } from "@local/hash-isomorphic-utils/flows/types";

export type FlowDefinitionsContextType = {
  /** The current edition of every flow definition the user can view, from the graph. */
  flowDefinitions: FlowDefinitionWithId[];
  loading: boolean;
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
