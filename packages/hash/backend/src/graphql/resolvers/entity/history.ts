import { Resolver, UnknownEntity } from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";
import { Entity } from "../../../db/adapter";

export const history: Resolver<
  Promise<UnknownEntity["history"]>,
  Entity,
  GraphQLContext
> = async (entity, _, { dataSources }) => {
  if (!entity.entityId) {
    return undefined;
  }
  const versions = await dataSources.db.getEntityHistory({
    accountId: entity.accountId,
    entityId: entity.entityId,
  });

  return versions?.map((ver) => ({
    entityId: ver.entityVersionId,
    createdAt: ver.createdAt,
  }));
};
