import { ResolverFn } from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";
import { UnresolvedGQLEntity, Account } from "../../../model";

export const accounts: ResolverFn<
  Promise<UnresolvedGQLEntity[]>,
  {},
  GraphQLContext,
  {}
> = async (_, __, { dataSources }) => {
  const allAccounts = await Account.getAll(dataSources.db);

  return allAccounts.map((account) => account.toGQLUnknownEntity());
};
