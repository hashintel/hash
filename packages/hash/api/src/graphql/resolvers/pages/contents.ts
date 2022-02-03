import { ApolloError } from "apollo-server-express";
import { DBAdapter, DbPageEntity } from "../../../db/adapter";
import { Entity, UnresolvedGQLEntity } from "../../../model";

import { Resolver } from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";

export const getBlocks = async (
  db: DBAdapter,
  blocks: { entityId: string; accountId: string }[],
) => {
  const entities = await Entity.getEntities(
    db,
    blocks.map(({ accountId, entityId }) => ({
      accountId,
      entityId,
    })),
  );

  entities.forEach((entity, i) => {
    if (!entity) {
      const { accountId, entityId } = blocks[i];
      throw new ApolloError(
        `entity ${entityId} not found in account ${accountId}`,
        "NOT_FOUND",
      );
    }
  });

  return entities.map((entity) => entity.toGQLUnknownEntity());
};

export const contents: Resolver<
  Promise<UnresolvedGQLEntity[]>,
  DbPageEntity["properties"],
  GraphQLContext
> = async (properties, _, { dataSources }) => {
  return await getBlocks(dataSources.db, properties.contents);
};
