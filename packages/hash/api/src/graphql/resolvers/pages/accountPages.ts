import { QueryAccountPagesArgs, Resolver } from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";
import { Entity, UnresolvedGQLEntity } from "../../../model";

export const accountPages: Resolver<
  Promise<UnresolvedGQLEntity[]>,
  {},
  GraphQLContext,
  QueryAccountPagesArgs
> = async (_, { accountId }, { dataSources }) => {
  const pages = await Entity.getEntitiesBySystemType(dataSources.db, {
    accountId,
    systemTypeName: "Page",
    latestOnly: true,
  });

  return pages.map((page) => page.toGQLUnknownEntity());
};
