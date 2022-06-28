import { QueryAccountPagesArgs, Resolver } from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";
import { Page, UnresolvedGQLEntity } from "../../../model";

export const accountPages: Resolver<
  Promise<UnresolvedGQLEntity[]>,
  {},
  GraphQLContext,
  QueryAccountPagesArgs
> = async (_, { accountId, includeArchived }, { dataSources }) => {
  const pages = await Page.getAllPagesInAccount(dataSources.db, {
    accountId,
    includeArchived: includeArchived ?? undefined,
  });

  return pages.map((page) => page.toGQLUnknownEntity());
};
