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

  // console.log(pages);
  return pages
    .sort((a, b) => a.properties.index?.localeCompare(b.properties.index))
    .map((page) => page.toGQLUnknownEntity());
};
