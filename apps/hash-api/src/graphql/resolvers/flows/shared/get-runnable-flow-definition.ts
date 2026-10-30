import { getFlowDefinitionEntityById } from "@local/hash-backend-utils/flows/shared/get-flow-definition-entity-by-id";
import { getFlowType } from "@local/hash-isomorphic-utils/flows/get-flow-type";
import { getFlowDefinitionFromEntity } from "@local/hash-isomorphic-utils/flows/mappings";

import * as GraphQLError from "../../../error";

import type { LoggedInGraphQLContext } from "../../../context";
import type { EntityId } from "@blockprotocol/type-system";

/**
 * A flow's `Flow Definition` entity.
 *
 * @throws a GraphQL not found error if it doesn't exist or the user can't view it.
 */
export const getFlowDefinitionEntity = async (
  { dataSources, authentication }: LoggedInGraphQLContext,
  flowDefinitionEntityId: EntityId,
) => {
  const flowDefinitionEntity = await getFlowDefinitionEntityById({
    flowDefinitionEntityId,
    graphApiClient: dataSources.graphApi,
    userAuthentication: authentication,
  });

  if (!flowDefinitionEntity) {
    throw GraphQLError.notFound(
      `No flow definition with id ${flowDefinitionEntityId} exists, or you can't view it`,
    );
  }

  return flowDefinitionEntity;
};

/**
 * Loads a flow's definition from its `Flow Definition` entity, and checks that the user can run it.
 *
 * @throws a GraphQL error if the definition doesn't exist or the user can't view it, if it's been archived or is
 *   invalid (a bad request, listing its problems if invalid), or if it's an AI flow and the user can't run AI flows.
 */
export const getRunnableFlowDefinition = async (
  graphQLContext: LoggedInGraphQLContext,
  flowDefinitionEntityId: EntityId,
) => {
  const flowDefinitionEntity = await getFlowDefinitionEntity(
    graphQLContext,
    flowDefinitionEntityId,
  );

  if (flowDefinitionEntity.metadata.archived) {
    throw GraphQLError.badRequest(
      "This flow has been archived, so it can't be run",
    );
  }

  let flowDefinition;

  try {
    flowDefinition = getFlowDefinitionFromEntity(flowDefinitionEntity);
  } catch (error) {
    /* A flow can be saved before it's valid, so this is for the user to fix. The message lists every problem. */
    throw GraphQLError.badRequest((error as Error).message);
  }

  const flowType = getFlowType(flowDefinition);

  if (
    flowType === "ai" &&
    !graphQLContext.user.enabledFeatureFlags.includes("ai")
  ) {
    throw GraphQLError.forbidden("AI flows are not enabled for this user");
  }

  return { flowDefinition, flowDefinitionEntity, flowType };
};
