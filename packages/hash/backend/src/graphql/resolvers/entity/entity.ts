import { ApolloError, UserInputError } from "apollo-server-express";

import { QueryEntityArgs, Resolver, Visibility } from "../../apiTypes.gen";
import { DbUnknownEntity } from "../../../types/dbTypes";
import { GraphQLContext } from "../../context";

export const entity: Resolver<
  Promise<DbUnknownEntity>,
  {},
  GraphQLContext,
  QueryEntityArgs
> = async (_, { accountId, id, metadataId }, { dataSources }) => {
  let dbEntity;
  if (id) {
    dbEntity = await dataSources.db.getEntity({
      accountId,
      entityId: id,
    });
    if (!dbEntity) {
      throw new ApolloError(`Entity ${id} not found in account ${accountId}`);
    }
  } else if (metadataId) {
    dbEntity = await dataSources.db.getLatestEntityVersion({
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

  const entity: DbUnknownEntity = {
    ...dbEntity,
    id: dbEntity.entityId,
    accountId: dbEntity.accountId,
    visibility: Visibility.Public, // TODO: should be a param?
  };

  return entity;
};
