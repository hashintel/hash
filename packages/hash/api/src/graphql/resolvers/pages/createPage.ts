import { MutationCreatePageArgs, Resolver } from "../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../context";
import { Page, UnresolvedGQLEntity } from "../../../model";

export const createPage: Resolver<
  Promise<UnresolvedGQLEntity>,
  {},
  LoggedInGraphQLContext,
  MutationCreatePageArgs
> = async (_, { accountId, properties }, { dataSources: { db }, user }) => {
  // @todo: generate all of the entity IDs up-front and create all entities below
  // concurrently (may need to defer FK constraints).

  const page = await Page.createPage(db, {
    accountId,
    createdBy: user,
    properties,
  });

  return page.toGQLUnknownEntity();
};
