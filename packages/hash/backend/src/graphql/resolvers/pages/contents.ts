import { Resolver, Visibility } from "../../apiTypes.gen";
import { DbBlock, DbPage } from "../../../types/dbTypes";
import { GraphQLContext } from "../../context";
import { ApolloError } from "apollo-server-express";

export const contents: Resolver<
  Promise<DbBlock[]>,
  DbPage["properties"],
  GraphQLContext
> = async ({ contents }, _, { dataSources }) => {
  const entities = await dataSources.db.getEntities(
    contents.map(({ accountId, entityId }) => ({
      accountId,
      entityVersionId: entityId,
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

  const res = entities.map((entity) => ({
    ...entity,
    id: entity!.entityVersionId,
    accountId: entity!.accountId,
    visibility: Visibility.Public, // TODO: get from entity metadata
  })) as DbBlock[];

  return res;
};
