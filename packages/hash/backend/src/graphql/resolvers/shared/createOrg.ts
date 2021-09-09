import { MutationCreateOrgArgs, Resolver } from "../../apiTypes.gen";
import { EntityWithIncompleteEntityType, Org } from "../../../model";
import { LoggedInGraphQLContext } from "../../context";

export const createOrg: Resolver<
  Promise<EntityWithIncompleteEntityType>,
  {},
  LoggedInGraphQLContext,
  MutationCreateOrgArgs
> = async (_, { shortname }, { dataSources, user }) => {
  const org = await Org.createOrg(dataSources.db)({
    properties: { shortname },
    createdById: user.entityId,
  });

  return org.toGQLUnknownEntity();
};
