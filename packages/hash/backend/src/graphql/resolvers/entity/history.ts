import { Resolver, UnknownEntity } from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";
import { DbUnknownEntity } from "../../../types/dbTypes";

export const history: Resolver<
  Promise<UnknownEntity["history"]>,
  DbUnknownEntity,
  GraphQLContext
> = async (entity, _, { dataSources }) => {
  if (!entity.metadataId) {
    return undefined;
  }
  const versions = await dataSources.db.getEntityHistory({
    accountId: entity.accountId,
    metadataId: entity.metadataId,
  });

  return versions?.map((ver) => ({
    entityId: ver.entityId,
    createdAt: ver.createdAt,
  }));
};
