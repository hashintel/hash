import { Resolver } from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";
import { EntityWithIncompleteEntityType, Entity } from "../../../model";

export const accounts: Resolver<
  Promise<EntityWithIncompleteEntityType[]>,
  {},
  GraphQLContext,
  {}
> = async (_, {}, { dataSources }) => {
  const entities = await Entity.getAccountEntities(dataSources.db);
  return entities.map((entity) => entity.toGQLUnknownEntity());
};
