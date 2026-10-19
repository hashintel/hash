import { useMemo } from "react";

import { FlowDefinitionsContext } from "./flow-definitions-context";
import { useFlowDefinitions } from "./use-flow-definitions";

import type { FlowDefinitionsContextType } from "./flow-definitions-context";
import type { EntityUuid } from "@blockprotocol/type-system";
import type { PropsWithChildren } from "react";

export const FlowDefinitionsContextProvider = ({
  children,
  selectedFlowDefinitionId,
}: PropsWithChildren<{ selectedFlowDefinitionId: EntityUuid | null }>) => {
  const { flowDefinitions, loading } = useFlowDefinitions();

  const context = useMemo<FlowDefinitionsContextType>(
    () => ({
      flowDefinitions,
      loading,
      selectedFlowDefinitionId,
    }),
    [flowDefinitions, loading, selectedFlowDefinitionId],
  );

  return (
    <FlowDefinitionsContext.Provider value={context}>
      {children}
    </FlowDefinitionsContext.Provider>
  );
};
