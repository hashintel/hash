import { ApolloError } from "apollo-server-express";

import { Resolver } from "../../apiTypes.gen";
import { DbBlockProperties } from "../../../types/dbTypes";
import { GraphQLContext } from "../../context";
import { Entity, EntityWithIncompleteEntityType } from "../../../model";
import { resolveLinkedData } from "../entity/properties";

export const blockEntity: Resolver<
  Promise<EntityWithIncompleteEntityType>,
  DbBlockProperties,
  GraphQLContext
> = async ({ accountId, entityId }, _, ctx, info) => {
  const { dataSources } = ctx;
  const entity = await Entity.getEntityLatestVersion(dataSources.db)({
    accountId,
    entityId,
  });
  if (!entity) {
    throw new ApolloError(
      `Entity id ${entityId} not found in account ${accountId}`,
      "NOT_FOUND"
    );
  }

  const mappedEntity = entity.toGQLUnknownEntity();

  await resolveLinkedData(ctx, entity.accountId, entity.properties, info);

  return mappedEntity;
};
