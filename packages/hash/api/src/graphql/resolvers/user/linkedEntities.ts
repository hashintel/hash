import { ApolloError } from "apollo-server-errors";
import { User } from "../../../model";
import { Resolver, User as GQLUser } from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";
import { UnresolvedGQLEntity } from "../../../model/entity.model";

export const memberOf: Resolver<
  Promise<UnresolvedGQLEntity[]>,
  GQLUser,
  GraphQLContext
> = async ({ entityId }, _, { dataSources }) => {
  const user = await User.getUserById(dataSources.db, { entityId });

  if (!user) {
    const msg = `User with entityId ${entityId} not found in datastore`;
    throw new ApolloError(msg, "NOT_FOUND");
  }

  const orgMemberships = await user.getOrgMemberships(dataSources.db);

  return orgMemberships.map((orgMembership) =>
    orgMembership.toGQLUnknownEntity(),
  );
};

export const userLinkedEntities = {
  memberOf,
};
