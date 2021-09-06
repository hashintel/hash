import { ApolloError, UserInputError } from "apollo-server-express";

import { QueryEntityArgs, Resolver } from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";
import { EntityWithIncompleteEntityType } from "../../../model";
import { Entity } from "../../../model";

export const entity: Resolver<
  Promise<EntityWithIncompleteEntityType>,
  {},
  GraphQLContext,
  QueryEntityArgs
> = async (_, { accountId, id, metadataId }, { dataSources }) => {
  let dbEntity;
  if (id) {
    dbEntity = await dataSources.db.getEntity({
      accountId,
      entityVersionId: id,
    });
    if (!dbEntity) {
      throw new ApolloError(`Entity ${id} not found in account ${accountId}`);
    }
  } else if (metadataId) {
    dbEntity = await dataSources.db.getEntityLatestVersion({
      accountId,
      entityId: metadataId,
    });
    if (!dbEntity) {
      throw new ApolloError(
        `Entity with entityId ${metadataId} not found in account ${accountId}`
      );
    }
  } else {
    throw new UserInputError(
      "at least one of id or metadataId must be provided"
    );
  }

  return new Entity(dbEntity).toGQLUnknownEntity();
};
