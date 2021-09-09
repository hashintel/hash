import { Resolver } from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";
import { EntityWithIncompleteEntityType, Account } from "../../../model";

export const accounts: Resolver<
  Promise<EntityWithIncompleteEntityType[]>,
  {},
  GraphQLContext,
  {}
> = async (_, {}, { dataSources }) => {
  const accounts = await Account.getAll(dataSources.db);

  return accounts.map((account) => account.toGQLUnknownEntity());
};
