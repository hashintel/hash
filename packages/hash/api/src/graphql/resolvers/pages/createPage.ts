import { MutationCreatePageArgs, Resolver } from "../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../context";
import { Page, UnresolvedGQLEntity } from "../../../model";

export const createPage: Resolver<
  Promise<UnresolvedGQLEntity>,
  {},
  LoggedInGraphQLContext,
  MutationCreatePageArgs
> = async (_, { accountId, properties }, { dataSources: { db }, user }) => {
  const page = await Page.createPage(db, {
    accountId,
    createdBy: user as any /** @todo: replace with updated model class */,
    properties,
  });

  return page.toGQLUnknownEntity();
};
