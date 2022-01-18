import { ApolloError } from "apollo-server-errors";
import { Org } from "../../../model";
import { Resolver, Org as GQLOrg } from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";
import { UnresolvedGQLEntity } from "../../../model/entity.model";

const notFoundMsg = (entityId: string) =>
  `Org with entityId ${entityId} not found in datastore`;

const invitationLinks: Resolver<
  Promise<UnresolvedGQLEntity[]>,
  GQLOrg,
  GraphQLContext
> = async ({ entityId }, _, { dataSources }) => {
  const org = await Org.getOrgById(dataSources.db, { entityId });

  if (!org) {
    throw new ApolloError(notFoundMsg(entityId), "NOT_FOUND");
  }

  const invitations = await org.getInvitationLinks(dataSources.db);

  return invitations.map((invitation) => invitation.toGQLUnknownEntity());
};

const memberships: Resolver<
  Promise<UnresolvedGQLEntity[]>,
  GQLOrg,
  GraphQLContext
> = async ({ entityId }, _, { dataSources }) => {
  const org = await Org.getOrgById(dataSources.db, { entityId });

  if (!org) {
    throw new ApolloError(notFoundMsg(entityId), "NOT_FOUND");
  }

  const orgMemberships = await org.getOrgMemberships(dataSources.db);

  return orgMemberships.map((orgMembership) =>
    orgMembership.toGQLUnknownEntity(),
  );
};

const emailInvitations: Resolver<
  Promise<UnresolvedGQLEntity[]>,
  GQLOrg,
  GraphQLContext
> = async ({ entityId }, _, { dataSources }) => {
  const org = await Org.getOrgById(dataSources.db, { entityId });

  if (!org) {
    throw new ApolloError(notFoundMsg(entityId), "NOT_FOUND");
  }

  const invitations = await org.getEmailInvitations(dataSources.db);

  return invitations.map((invitation) => invitation.toGQLUnknownEntity());
};

export const orgLinkedEntities = {
  invitationLinks,
  memberships,
  emailInvitations,
};
