import {
  QueryAccountPagesArgs,
  Resolver,
  UnknownEntity,
} from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";
import { dbEntityToGraphQLEntity } from "../../util";

export const accountPages: Resolver<
  Promise<UnknownEntity[]>,
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
