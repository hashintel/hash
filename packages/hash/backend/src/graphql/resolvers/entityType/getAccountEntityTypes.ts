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
> = async (_, { accountId, includeOtherTypesInUse }, { dataSources }) =>
  EntityType.getAccountEntityTypes(dataSources.db)({
    accountId,
    includeOtherTypesInUse,
  });
