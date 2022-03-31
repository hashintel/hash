import { Resolver, Org as GQLOrg } from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";
import { UnresolvedGQLEntity } from "../../../model/entity.model";
import { expectOrgForApollo } from "./expectOrgForApollo";

const invitationLinks: Resolver<
  Promise<UnresolvedGQLEntity[]>,
  GQLOrg,
  GraphQLContext
> = async ({ entityId }, _, { dataSources }) => {
  const org = await expectOrgForApollo(dataSources.db, { entityId });
  const invitations = await org.getInvitationLinks(dataSources.db);

  return invitations.map((invitation) => invitation.toGQLUnknownEntity());
};

const memberships: Resolver<
  Promise<UnresolvedGQLEntity[]>,
  GQLOrg,
  GraphQLContext
> = async ({ entityId }, _, { dataSources }) => {
  const org = await expectOrgForApollo(dataSources.db, { entityId });

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
  const org = await expectOrgForApollo(dataSources.db, { entityId });

  const invitations = await org.getEmailInvitations(dataSources.db);

  return invitations.map((invitation) => invitation.toGQLUnknownEntity());
};

export const orgLinkedEntities = {
  invitationLinks,
  memberships,
  emailInvitations,
};
