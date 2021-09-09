import { MutationCreateOrgArgs, Resolver } from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";
import { EntityWithIncompleteEntityType, Org } from "../../../model";

export const createOrg: Resolver<
  Promise<EntityWithIncompleteEntityType>,
  {},
  GraphQLContext,
  MutationCreateOrgArgs
> = async (_, { shortname }, { dataSources }) => {
  const org = await Org.createOrg(dataSources.db)({ shortname });

  return org.toGQLUnknownEntity();
};
