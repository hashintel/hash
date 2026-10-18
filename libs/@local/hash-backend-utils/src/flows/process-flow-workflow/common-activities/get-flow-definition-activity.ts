import { getFlowDefinitionFromEntity } from "@local/hash-isomorphic-utils/flows/mappings";

import { getFlowDefinitionEntityById } from "../../shared/get-flow-definition-entity-by-id.js";

import type {
  ActorEntityUuid,
  EntityId,
  EntityUuid,
} from "@blockprotocol/type-system";
import type { GraphApi } from "@local/hash-graph-client";
import type { FlowDefinition } from "@local/hash-isomorphic-utils/flows/types";

export type GetFlowDefinitionActivityParams = {
  flowDefinitionId: EntityUuid;
  userAuthentication: { actorId: ActorEntityUuid };
};

/**
 * Loads the definition a run executes from its `Flow Definition` entity, and validates it. Returns the entity's id
 * too, for the run to link to.
 */
export const getFlowDefinitionActivity = async (
  params: GetFlowDefinitionActivityParams & { graphApiClient: GraphApi },
): Promise<
  | {
      status: "ok";
      flowDefinition: FlowDefinition;
      flowDefinitionEntityId: EntityId;
    }
  | { status: "not-found" | "invalid"; errorMessage: string }
> => {
  const { flowDefinitionId, graphApiClient, userAuthentication } = params;

  const entity = await getFlowDefinitionEntityById({
    flowDefinitionId,
    graphApiClient,
    userAuthentication,
  });

  if (!entity) {
    return {
      status: "not-found",
      errorMessage: `No Flow Definition entity with uuid ${flowDefinitionId} exists, or the user can't view it`,
    };
  }

  try {
    return {
      status: "ok",
      flowDefinition: getFlowDefinitionFromEntity(entity),
      flowDefinitionEntityId: entity.metadata.recordId.entityId,
    };
  } catch (error) {
    return { status: "invalid", errorMessage: (error as Error).message };
  }
};
