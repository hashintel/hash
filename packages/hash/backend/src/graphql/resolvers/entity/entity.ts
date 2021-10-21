import { ApolloError, UserInputError } from "apollo-server-express";

import { QueryEntityArgs, Resolver } from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";
import { EntityWithIncompleteEntityType, Entity } from "../../../model";

export const entity: Resolver<
  Promise<EntityWithIncompleteEntityType>,
  {},
  GraphQLContext,
  QueryEntityArgs
> = async (_, { accountId, entityVersionId, entityId }, { dataSources }) => {
  let dbEntity;
  if (entityVersionId) {
    dbEntity = await dataSources.db.getEntity({
      accountId,
      entityVersionId,
    });
    if (!dbEntity) {
      throw new ApolloError(
        `Entity with version ID ${entityVersionId} not found in account ${accountId}`,
        "NOT_FOUND"
      );
    }
  } else if (entityId) {
    dbEntity = await dataSources.db.getEntityLatestVersion({
      accountId,
      entityId,
    });
    if (!dbEntity) {
      throw new ApolloError(
        `Entity with fixed ID ${entityId} not found in account ${accountId}`
      );
    }
  } else {
    throw new UserInputError(
      "at least one of entityVersionId or entityId must be provided"
    );
  }

  return new Entity(dbEntity).toGQLUnknownEntity();
};
