import { ApolloError } from "apollo-server-errors";
import { UserModel } from "../../../model";
import { ResolverFn, User as GQLUser } from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";
import { UnresolvedGQLEntity } from "../../../model/entity.model";

export const memberOf: ResolverFn<
  Promise<UnresolvedGQLEntity[]>,
  GQLUser,
  GraphQLContext,
  {}
> = async ({ entityId }, _, { dataSources: { graphApi } }) => {
  const user = await UserModel.getUserById(graphApi, { entityId });

  if (!user) {
    const msg = `User with entityId ${entityId} not found in graph`;
    throw new ApolloError(msg, "NOT_FOUND");
  }

  return [];

  /** @todo: bring back org memberships */
  // const orgMemberships = await user.getOrgMemberships(dataSources.db);

  // return orgMemberships.map((orgMembership) =>
  //   orgMembership.toGQLUnknownEntity(),
  // );
};

export const userLinkedEntities = {
  memberOf,
};
