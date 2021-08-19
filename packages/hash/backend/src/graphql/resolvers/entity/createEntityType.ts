import { genId } from "../../../util";
import { MutationCreateEntityTypeArgs, Resolver } from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";
import { EntityType } from "../../../db/adapter";

export const createEntityType: Resolver<
  Promise<EntityType>,
  {},
  GraphQLContext,
  MutationCreateEntityTypeArgs
> = async (_, { accountId, name, schema }, { dataSources }) => {
  return dataSources.db.createEntityType({
    accountId,
    createdById: genId(), // TODO
    name,
    schema,
  });
};
