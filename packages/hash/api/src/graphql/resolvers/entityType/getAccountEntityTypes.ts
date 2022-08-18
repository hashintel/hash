import { QueryGetAccountEntityTypesArgs, ResolverFn } from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";
import EntityType, {
  UnresolvedGQLEntityType,
} from "../../../model/entityType.model";

export const getAccountEntityTypes: ResolverFn<
  Promise<UnresolvedGQLEntityType[]>,
  {},
  GraphQLContext,
  QueryGetAccountEntityTypesArgs
> = async (
  _,
  { accountId, includeAllTypes, includeOtherTypesInUse },
  { dataSources },
) =>
  EntityType.getAccountEntityTypes(dataSources.db, {
    accountId,
    includeAllTypes,
    includeOtherTypesInUse,
  });
