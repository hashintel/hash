import { ApolloError, ForbiddenError } from "apollo-server-errors";
import {
  MutationCreateOrgEmailInvitationArgs,
  ResolverFn,
} from "../../apiTypes.gen";
import { UnresolvedGQLEntity, Org, OrgEmailInvitation } from "../../../model";
import { LoggedInGraphQLContext } from "../../context";

export const createOrgEmailInvitation: ResolverFn<
  Promise<UnresolvedGQLEntity>,
  {},
  LoggedInGraphQLContext,
  MutationCreateOrgEmailInvitationArgs
> = async (
  _,
  { orgEntityId, inviteeEmailAddress },
  { emailTransporter, dataSources, userModel },
) =>
  dataSources.db.transaction(async (client) => {
    const { graphApi } = dataSources;
    const org = await Org.getOrgById(client, { entityId: orgEntityId });

    if (!org) {
      const msg = `Org with entityId ${orgEntityId} not found in datastore`;
      throw new ApolloError(msg, "NOT_FOUND");
    }

    if (
      !(await userModel.isMemberOfOrg(graphApi, { orgEntityId: org.entityId }))
    ) {
      throw new ForbiddenError(
        `User with entityId ${userModel.entityId} is not a member of the org with entityId ${org.entityId}`,
      );
    }

    /** @todo: ensure a user with the verified email address is not already a member of the org */

    const existingEmailInvitations = await org.getEmailInvitations(client);

    const matchingExistingEmailInvitation = existingEmailInvitations
      .filter((invitation) => invitation.isValid())
      .find(
        ({ properties }) =>
          properties.inviteeEmailAddress === inviteeEmailAddress,
      );

    if (matchingExistingEmailInvitation) {
      const msg = `User with email ${inviteeEmailAddress} address has already been invited to org with entityId ${org.entityId}`;
      throw new ApolloError(msg, "ALREADY_INVITED");
    }

    const emailInvitation = await OrgEmailInvitation.createOrgEmailInvitation(
      client,
      emailTransporter,
      {
        org,
        inviter:
          userModel as any /** @todo: replace with updated model class */,
        inviteeEmailAddress,
      },
    );

    return emailInvitation.toGQLUnknownEntity();
  });
