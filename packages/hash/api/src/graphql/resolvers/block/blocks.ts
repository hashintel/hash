import { Entity, UnresolvedGQLEntity } from "../../../model";

import { QueryBlocksArgs, ResolverFn } from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";

export const blocks: ResolverFn<
  Promise<UnresolvedGQLEntity[]>,
  {},
  GraphQLContext,
  QueryBlocksArgs
> = async (_, args, { dataSources }) => {
  const { db } = dataSources;
  const entities = await Entity.getEntities(
    db,
    args.blocks.map(({ accountId, entityId }) => ({
      accountId,
      entityId,
    })),
  );

  return entities.map((entity) => entity.toGQLUnknownEntity());
};
