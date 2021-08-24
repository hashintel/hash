import { ApolloError } from "apollo-server-express";

import { Resolver, UnknownEntity } from "../../apiTypes.gen";
import { DbPage } from "../../../types/dbTypes";
import { GraphQLContext } from "../../context";
import { dbEntityToGraphQLEntity } from "../../util";

export const contents: Resolver<
  Promise<UnknownEntity[]>,
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

  return entities.map(dbEntityToGraphQLEntity);
};
