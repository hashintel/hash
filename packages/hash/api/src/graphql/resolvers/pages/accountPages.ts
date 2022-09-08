import { QueryAccountPagesArgs, ResolverFn } from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";
import { Page, UnresolvedGQLEntity } from "../../../model";

export const accountPages: ResolverFn<
  Promise<UnresolvedGQLEntity[]>,
  {},
  GraphQLContext,
  QueryAccountPagesArgs
> = async (_, { accountId }, { dataSources }) => {
  const pages = await Page.getAllPagesInAccount(dataSources.db, {
    accountId,
  });

  return pages
    .sort((a, b) =>
      !a.properties.index || a.properties.index > b.properties.index ? 1 : -1,
    )
    .map((page) => page.toGQLUnknownEntity());
};
