import { ApolloError } from "apollo-server-express";

import { QueryOrgEmailInvitationArgs, Resolver } from "../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../context";
import { Org, EntityTypeWithoutTypeFields } from "../../../model";

export const orgEmailInvitation: Resolver<
  Promise<EntityTypeWithoutTypeFields>,
  {},
  LoggedInGraphQLContext,
  QueryOrgEmailInvitationArgs
> = async (
  _,
  { orgAccountId, orgEntityId, invitationEmailToken },
  { dataSources, user }
) =>
  dataSources.db.transaction(async (client) => {
    const org = await Org.getOrgById(client)({
      accountId: orgAccountId,
      entityId: orgEntityId,
    });

    if (!org) {
      const msg = `Org with entityId ${orgEntityId} not found in datastore`;
      throw new ApolloError(msg, "ORG_NOT_FOUND");
    }

    const emailInvitation = await org.getEmailInvitationWithToken(client)(
      invitationEmailToken
    );

    const errorMsgPrefix = `The email invitation with token ${invitationEmailToken} associated with org with entityId ${orgEntityId}`;

    if (
      !emailInvitation ||
      !user.getEmail(emailInvitation.properties.inviteeEmailAddress)?.verified
    ) {
      const msg = `${errorMsgPrefix} could not be found in the datastore.`;
      throw new ApolloError(msg, "NOT_FOUND");
    }

    if (emailInvitation.hasBeenRevoked()) {
      const msg = `${errorMsgPrefix} has been revoked.`;
      throw new ApolloError(msg, "REVOKED");
    }

    if (emailInvitation.hasBeenUsed()) {
      const msg = `${errorMsgPrefix} has been used.`;
      throw new ApolloError(msg, "ALREADY_USED");
    }

    /** @todo: verify the invitation hasn't expired */

    return emailInvitation.toGQLUnknownEntity();
  });
