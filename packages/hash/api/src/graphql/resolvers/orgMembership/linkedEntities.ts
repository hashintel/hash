import { ApolloError } from "apollo-server-errors";
import { OrgMembership } from "../../../model";
import {
  Resolver,
  OrgMembership as GQLOrgMembership,
} from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";
import { UnresolvedGQLEntity } from "../../../model/entity.model";

const notFoundMsg = (entityId: string, accountId: string) =>
  `OrgMembership with entityId ${entityId} in account ${accountId} not found in datastore`;

const user: Resolver<
  Promise<UnresolvedGQLEntity>,
  GQLOrgMembership,
  GraphQLContext
> = async ({ accountId, entityId }, _, { dataSources }) => {
  const orgMembership = await OrgMembership.getOrgMembershipById(
    dataSources.db,
    { accountId, entityId },
  );

  if (!orgMembership) {
    throw new ApolloError(notFoundMsg(entityId, accountId), "NOT_FOUND");
  }

  const orgMembershipUser = await orgMembership.getUser(dataSources.db);

  return orgMembershipUser.toGQLUnknownEntity();
};

const org: Resolver<
  Promise<UnresolvedGQLEntity>,
  GQLOrgMembership,
  GraphQLContext
> = async ({ accountId, entityId }, _, { dataSources }) => {
  const orgMembership = await OrgMembership.getOrgMembershipById(
    dataSources.db,
    { accountId, entityId },
  );

  if (!orgMembership) {
    throw new ApolloError(notFoundMsg(entityId, accountId), "NOT_FOUND");
  }

  const orgMembershipOrg = await orgMembership.getOrg(dataSources.db);

  return orgMembershipOrg.toGQLUnknownEntity();
};

export const orgMembershipLinkedEntities = {
  user,
  org,
};
