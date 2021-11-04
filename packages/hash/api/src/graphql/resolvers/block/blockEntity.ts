import { ApolloError } from "apollo-server-express";

import { Resolver } from "../../apiTypes.gen";
import { DbBlockProperties } from "../../../types/dbTypes";
import { GraphQLContext } from "../../context";
import { Entity, UnresolvedGQLEntity } from "../../../model";
import { resolveLinkedData } from "../entity/properties";

export const blockEntity: Resolver<
  Promise<UnresolvedGQLEntity>,
  DbBlockProperties,
  GraphQLContext
> = async ({ accountId, entityId }, _, ctx, info) => {
  const { dataSources } = ctx;
  const entity = await Entity.getEntityLatestVersion(dataSources.db, {
    accountId,
    entityId,
  });
  if (!entity) {
    throw new ApolloError(
      `Entity id ${entityId} not found in account ${accountId}`,
      "NOT_FOUND",
    );
  }

  const mappedEntity = entity.toGQLUnknownEntity();

  /**
   * `Block.entity` is typed in GraphQL as JSONData. This is because
   * Entity.properties (in some cases) is typed as JSONData too, which can
   * contain entities, which will then by typed as JSONData, which means if we
   * want the frontend to be able to treat these equally, we'll want
   * Block.entity to be JSONData. However, this means any Entity.* custom
   * resolvers won't be triggered for properties on Block.entity. This means
   * we need to manually resolve any links contained within the entity.
   */
  await resolveLinkedData(ctx, entity.accountId, entity.properties, info);

  return mappedEntity;
};
