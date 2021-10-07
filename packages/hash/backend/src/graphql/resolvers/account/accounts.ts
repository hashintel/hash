import { Resolver } from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";
import { EntityWithIncompleteEntityType, Account } from "../../../model";

export const accounts: Resolver<
  Promise<EntityWithIncompleteEntityType[]>,
  {},
  GraphQLContext,
  {}
> = async (_, __, { dataSources }) => {
  const allAccounts = await Account.getAll(dataSources.db);

  return allAccounts.map((account) => account.toGQLUnknownEntity());
};
