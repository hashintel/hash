import { ApolloError } from "apollo-server-express";

import { QueryGetOrgInvitationLinkArgs, Resolver } from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";
import { Org, EntityTypeWithoutTypeFields } from "../../../model";

export const getOrgInvitationLink: Resolver<
  Promise<EntityTypeWithoutTypeFields>,
  {},
  GraphQLContext,
  QueryGetOrgInvitationLinkArgs
> = async (_, { orgEntityId, invitationLinkToken }, { dataSources }) =>
  dataSources.db.transaction(async (client) => {
    const org = await Org.getOrgById(client)({ entityId: orgEntityId });

    if (!org) {
      const msg = `Org with entityId ${orgEntityId} not found in datastore`;
      throw new ApolloError(msg, "ORG_NOT_FOUND");
    }

    const invitation = await org.getInvitationLinkWithToken(client)({
      invitationLinkToken,
    });

    return invitation.toGQLUnknownEntity();
  });
