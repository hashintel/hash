import { Resolver } from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";
import { Org } from "../../apiTypes.gen";
import { dbEntityToGraphQLOrg } from "../../util";

export const accounts: Resolver<
  Promise<Org[]>,
  {},
  GraphQLContext,
  {}
> = async (_, {}, { dataSources }) => {
  const entities = await dataSources.db.getAccountEntities();
  return entities.map(dbEntityToGraphQLOrg);
};
