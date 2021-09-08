import { QueryGetAccountEntityTypesArgs, Resolver } from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";
import EntityType, {
  EntityTypeWithoutTypeFields,
} from "../../../model/entityType.model";

export const getAccountEntityTypes: Resolver<
  Promise<EntityTypeWithoutTypeFields[]>,
  {},
  GraphQLContext,
  QueryGetAccountEntityTypesArgs
> = async (_, { accountId }, { dataSources }) =>
  EntityType.getEntityTypes(dataSources.db)({ accountId });
