import { ApolloError, ForbiddenError } from "apollo-server-errors";
import {
  MutationCreateOrgEmailInvitationArgs,
  Resolver,
} from "../../apiTypes.gen";
import {
  EntityWithIncompleteEntityType,
  Org,
  OrgEmailInvitation,
} from "../../../model";
import { LoggedInGraphQLContext } from "../../context";

export const createOrgEmailInvitation: Resolver<
  Promise<EntityWithIncompleteEntityType>,
  {},
  LoggedInGraphQLContext,
  MutationCreateOrgEmailInvitationArgs
> = async (
  _,
  { orgEntityId, inviteeEmailAddress },
  { emailTransporter, dataSources, user }
) =>
  dataSources.db.transaction(async (client) => {
    const org = await Org.getOrgById(client)({ entityId: orgEntityId });

    if (!org) {
      const msg = `Org with entityId ${orgEntityId} not found in datastore`;
      throw new ApolloError(msg, "NOT_FOUND");
    }

    if (!user.isMemberOfOrg(org)) {
      throw new ForbiddenError(
        `User with entityId ${user.entityId} is not a member of the org with entityId ${org.entityId}`
      );
    }

    /** @todo: ensure a user with the verified email address is not already a member of the org */

    const existingEmailInvitations = await org.getEmailInvitations(client);

    const matchingExistingEmailInvitation = existingEmailInvitations
      .filter((invitation) => invitation.isValid())
      .find(
        ({ properties }) =>
          properties.inviteeEmailAddress === inviteeEmailAddress
      );

    if (matchingExistingEmailInvitation) {
      const msg = `User with email ${inviteeEmailAddress} address has already been invited to org with entityId ${org.entityId}`;
      throw new ApolloError(msg, "ALREADY_INVITED");
    }

    const emailInvitation = await OrgEmailInvitation.createOrgEmailInvitation(
      client,
      emailTransporter
    )({ org, inviter: user, inviteeEmailAddress });

    return emailInvitation.toGQLUnknownEntity();
  });
