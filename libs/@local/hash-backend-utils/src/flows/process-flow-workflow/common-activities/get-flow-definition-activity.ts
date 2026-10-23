import { getFlowDefinitionFromEntity } from "@local/hash-isomorphic-utils/flows/mappings";

import { getFlowDefinitionEntityById } from "../../shared/get-flow-definition-entity-by-id.js";

import type {
  ActorEntityUuid,
  EntityId,
  Timestamp,
} from "@blockprotocol/type-system";
import type { GraphApi } from "@local/hash-graph-client";
import type { FlowDefinition } from "@local/hash-isomorphic-utils/flows/types";

export type GetFlowDefinitionActivityParams = {
  /** When the run started: it executes the edition of the definition current then. */
  atTime: Timestamp;
  flowDefinitionEntityId: EntityId;
  userAuthentication: { actorId: ActorEntityUuid };
};

/**
 * Loads the definition a run executes from its `Flow Definition` entity, as it was at `atTime`, and validates it.
 * Returns the entity's id too, for the run to link to.
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
  const { atTime, flowDefinitionEntityId, graphApiClient, userAuthentication } =
    params;

  const entity = await getFlowDefinitionEntityById({
    atTime,
    flowDefinitionEntityId,
    graphApiClient,
    userAuthentication,
  });

  if (!entity) {
    return {
      status: "not-found",
      errorMessage: `No Flow Definition entity ${flowDefinitionEntityId} exists, or the user can't view it`,
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
