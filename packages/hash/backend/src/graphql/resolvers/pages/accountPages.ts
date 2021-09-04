import { QueryAccountPagesArgs, Resolver } from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";
import { dbEntityToGraphQLEntity } from "../../util";
import { EntityWithIncompleteEntityType } from "../../../model/entityType.model";

export const accountPages: Resolver<
  Promise<EntityWithIncompleteEntityType[]>,
  {},
  GraphQLContext,
  QueryAccountPagesArgs
> = async (_, { accountId }, { dataSources }) => {
  const pages = await dataSources.db.getEntitiesBySystemType({
    accountId,
    systemTypeName: "Page",
    latestOnly: true,
  });
  return pages.map(dbEntityToGraphQLEntity);
};
