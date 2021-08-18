import { ApolloError } from "apollo-server-express";

import { Resolver, Visibility } from "../../apiTypes.gen";
import { DbBlockProperties, DbUnknownEntity } from "../../../types/dbTypes";
import { GraphQLContext } from "../../context";

export const blockEntity: Resolver<
  Promise<DbUnknownEntity>,
  DbBlockProperties,
  GraphQLContext,
  {}
> = async ({ accountId, entityId }, {}, { dataSources }) => {
  const entity = await dataSources.db.getEntity({
    accountId,
    entityVersionId: entityId,
  });
  if (!entity) {
    throw new ApolloError(
      `Entity id ${entityId} not found in account ${accountId}`,
      "NOT_FOUND"
    );
  }

  return {
    ...entity,
    id: entity.entityVersionId,
    accountId: entity.accountId,
    visibility: Visibility.Public, // TODO: get from entity metadata
  };
};
