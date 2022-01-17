import { ApolloError } from "apollo-server-express";

import { QueryGetOrgEmailInvitationArgs, Resolver } from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";
import { Org, UnresolvedGQLUnknownEntity } from "../../../model";

export const getOrgEmailInvitation: Resolver<
  Promise<UnresolvedGQLUnknownEntity>,
  {},
  GraphQLContext,
  QueryGetOrgEmailInvitationArgs
> = async (_, { orgEntityId, invitationEmailToken }, { dataSources }) =>
  dataSources.db.transaction(async (client) => {
    const org = await Org.getOrgById(client, { entityId: orgEntityId });

    if (!org) {
      const msg = `Org with entityId ${orgEntityId} not found in datastore`;
      throw new ApolloError(msg, "ORG_NOT_FOUND");
    }

    const emailInvitation = await org.getEmailInvitationWithToken(client, {
      invitationEmailToken,
    });

    /** @todo: verify the invitation hasn't expired */

    return emailInvitation.toGQLUnknownEntity();
  });
