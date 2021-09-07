import { Resolver } from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";
import { dbEntityToGraphQLEntity } from "../../util";
import { EntityWithIncompleteEntityType } from "../../../model";

export const accounts: Resolver<
  Promise<EntityWithIncompleteEntityType[]>,
  {},
  GraphQLContext,
  {}
> = async (_, {}, { dataSources }) => {
  const entities = await dataSources.db.getAccountEntities();
  return entities.map(dbEntityToGraphQLEntity);
};
