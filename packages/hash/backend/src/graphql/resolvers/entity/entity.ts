import { ApolloError, UserInputError } from "apollo-server-express";

import { QueryEntityArgs, Resolver } from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";
import { Entity } from "../../../db/adapter";

export const entity: Resolver<
  Promise<Entity>,
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
      metadataId,
    });
    if (!dbEntity) {
      throw new ApolloError(
        `Entity with metadataId ${metadataId} not found in account ${accountId}`
      );
    }
  } else {
    throw new UserInputError(
      "at least one of id or metadataId must be provided"
    );
  }

  return dbEntity;
};
