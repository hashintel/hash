import { ApolloError } from "apollo-server-express";

import { QueryGetOrgEmailInvitationArgs, Resolver } from "../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../context";
import { Org, EntityTypeWithoutTypeFields } from "../../../model";

export const getOrgEmailInvitation: Resolver<
  Promise<EntityTypeWithoutTypeFields>,
  {},
  LoggedInGraphQLContext,
  QueryGetOrgEmailInvitationArgs
> = async (_, { orgEntityId, invitationEmailToken }, { dataSources, user }) =>
  dataSources.db.transaction(async (client) => {
    const org = await Org.getOrgById(client)({ entityId: orgEntityId });

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

    emailInvitation.validate();

    /** @todo: verify the invitation hasn't expired */

    return emailInvitation.toGQLUnknownEntity();
  });
