import { useCallback } from "react";

import { extractWebIdFromEntityId } from "@blockprotocol/type-system";
import { generateHashFlowDefinitionEntityId } from "@local/hash-isomorphic-utils/flows/flow-definition-ids";

import { useHashInstance } from "../../components/hooks/use-hash-instance";

import type { EntityId, EntityUuid } from "@blockprotocol/type-system";

/**
 * Generates the entity id of one of the flows defined in code, from its id in `flowDefinitionIds`, to start a run of
 * it. They're in the web the `HASH Instance` entity is in.
 */
export const useGenerateHashFlowDefinitionEntityId = () => {
  const { hashInstance } = useHashInstance();

  return useCallback(
    (flowDefinitionId: EntityUuid): EntityId => {
      if (!hashInstance) {
        throw new Error("The HASH instance hasn't loaded");
      }

      return generateHashFlowDefinitionEntityId(
        extractWebIdFromEntityId(hashInstance.metadata.recordId.entityId),
        flowDefinitionId,
      );
    },
    [hashInstance],
  );
};
