import { ApolloError } from "apollo-server-express";

import { Resolver } from "../../apiTypes.gen";
import { DbPage } from "../../../types/dbTypes";
import { GraphQLContext } from "../../context";
import { Entity, EntityWithIncompleteEntityType } from "../../../model";

export const contents: Resolver<
  Promise<EntityWithIncompleteEntityType[]>,
  DbPage["properties"],
  GraphQLContext
> = async ({ contents }, _, { dataSources }) => {
  const entities = await Entity.getEntities(dataSources.db)(
    contents.map(({ accountId, entityId }) => ({
      accountId,
      entityId,
    }))
  );

  entities.forEach((entity, i) => {
    if (!entity) {
      const { accountId, entityId } = contents[i];
      throw new ApolloError(
        `entity ${entityId} not found in account ${accountId}`,
        "NOT_FOUND"
      );
    }
  });

  return entities.map((entity) => entity.toGQLUnknownEntity());
};
