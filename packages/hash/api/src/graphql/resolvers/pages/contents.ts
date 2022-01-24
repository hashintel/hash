import { ApolloError } from "apollo-server-express";

import { Resolver } from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";
import { Entity, UnresolvedGQLEntity } from "../../../model";
import { DbPage } from "../../../db/adapter";

export const contents: Resolver<
  Promise<UnresolvedGQLEntity[]>,
  DbPage["properties"],
  GraphQLContext
> = async (properties, _, { dataSources }) => {
  const entities = await Entity.getEntities(
    dataSources.db,
    properties.contents.map(({ accountId, entityId }) => ({
      accountId,
      entityId,
    })),
  );

  entities.forEach((entity, i) => {
    if (!entity) {
      const { accountId, entityId } = properties.contents[i];
      throw new ApolloError(
        `entity ${entityId} not found in account ${accountId}`,
        "NOT_FOUND",
      );
    }
  });

  return entities.map((entity) => entity.toGQLUnknownEntity());
};
