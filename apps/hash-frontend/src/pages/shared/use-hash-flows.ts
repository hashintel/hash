import { useMemo } from "react";

import {
  generateHashFlowDefinitionEntityId,
  isGoalFlowDefinitionEntityId,
} from "@local/hash-isomorphic-utils/flows/flow-definition-ids";

import { useHashInstance } from "../../components/hooks/use-hash-instance";

import type { EntityId, EntityUuid } from "@blockprotocol/type-system";

/**
 * Finds the flows HASH provides, whose entities are in the `h` web, by their fixed ids (see `flowDefinitionIds`).
 * Their entity ids are only known once the `h` web's id has loaded.
 */
export const useHashFlows = () => {
  const { hashWebId } = useHashInstance();

  return useMemo(
    () => ({
      generateHashFlowDefinitionEntityId: (
        flowDefinitionId: EntityUuid,
      ): EntityId | undefined =>
        hashWebId
          ? generateHashFlowDefinitionEntityId(hashWebId, flowDefinitionId)
          : undefined,
      /** As `generateHashFlowDefinitionEntityId`, for starting a run, which can't wait for the `h` web's id. */
      requireHashFlowDefinitionEntityId: (
        flowDefinitionId: EntityUuid,
      ): EntityId => {
        if (!hashWebId) {
          throw new Error(
            "The h web's id hasn't loaded, so HASH's flows can't be started yet",
          );
        }
        return generateHashFlowDefinitionEntityId(hashWebId, flowDefinitionId);
      },
      isGoalFlow: (flowDefinitionEntityId: EntityId) =>
        !!hashWebId &&
        isGoalFlowDefinitionEntityId(flowDefinitionEntityId, hashWebId),
    }),
    [hashWebId],
  );
};
