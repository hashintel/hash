import { useMemo } from "react";

import { FlowDefinitionsContext } from "./flow-definitions-context";
import { useFlowDefinitions } from "./use-flow-definitions";

import type { FlowDefinitionsContextType } from "./flow-definitions-context";
import type { EntityId } from "@blockprotocol/type-system";
import type { PropsWithChildren } from "react";

export const FlowDefinitionsContextProvider = ({
  children,
  selectedFlowDefinitionEntityId,
}: PropsWithChildren<{ selectedFlowDefinitionEntityId: EntityId | null }>) => {
  const { flowDefinitions, loading } = useFlowDefinitions();

  const context = useMemo<FlowDefinitionsContextType>(
    () => ({
      flowDefinitions,
      loading,
      selectedFlowDefinitionEntityId,
    }),
    [flowDefinitions, loading, selectedFlowDefinitionEntityId],
  );

  return (
    <FlowDefinitionsContext.Provider value={context}>
      {children}
    </FlowDefinitionsContext.Provider>
  );
};
