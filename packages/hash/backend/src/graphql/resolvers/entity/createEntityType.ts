import { genId } from "../../../util";
import { MutationCreateEntityTypeArgs, Resolver } from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";
import { EntityType } from "../../apiTypes.gen";
import { dbEntityTypeToGraphQLEntityType } from "../../util";

export const createEntityType: Resolver<
  Promise<EntityType>,
  {},
  GraphQLContext,
  MutationCreateEntityTypeArgs
> = async (_, { accountId, name, schema }, { dataSources }) => {
  const entityType = await dataSources.db.createEntityType({
    accountId,
    createdById: genId(), // TODO
    name,
    schema,
  });
  return dbEntityTypeToGraphQLEntityType(entityType);
};
