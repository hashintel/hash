import { MutationJoinOrgArgs, Resolver } from "../../apiTypes.gen";
import {
  EntityWithIncompleteEntityType,
  Org,
  OrgEmailInvitation,
} from "../../../model";
import { LoggedInGraphQLContext } from "../../context";
import { ApolloError } from "apollo-server-errors";

export const joinOrg: Resolver<
  Promise<EntityWithIncompleteEntityType>,
  {},
  LoggedInGraphQLContext,
  MutationJoinOrgArgs
> = async (_, args, { dataSources, user }) =>
  dataSources.db.transaction(async (client) => {
    const { orgAccountId, orgEntityId, verification, responsibility } = args;

    const org = await Org.getOrgById(client)({
      accountId: orgAccountId,
      entityId: orgEntityId,
    });

    if (!org) {
      const msg = `Org with entityId ${orgEntityId} not found in datastore`;
      throw new ApolloError(msg, "ORG_NOT_FOUND");
    }

    const { invitationToken, emailInvitationToken } = verification;

    if (!invitationToken && !emailInvitationToken) {
      const msg = `Either an org invitation or email invitation token must be provided`;
      throw new ApolloError(msg);
    }

    const invitation = invitationToken
      ? await org.getInvitationWithToken(client)(invitationToken)
      : emailInvitationToken
      ? await org.getEmailInvitationWithToken(client)(emailInvitationToken)
      : null;

    if (!invitation) {
      const msg = `The invitation with token ${invitationToken} associated with org with entityId ${orgEntityId} not found in the datastore.`;
      throw new ApolloError(msg, "INVITATION_NOT_FOUND");
    }

    if (invitation.hasBeenRevoked()) {
      const msg = `The invitation with token ${invitationToken} associated with org with entityId ${orgEntityId} has been revoked.`;
      throw new ApolloError(msg, "INVITATION_REVOKED");
    }

    if (invitation instanceof OrgEmailInvitation) {
      if (invitation.hasBeenUsed()) {
        const msg = `The email invitation with token ${invitationToken} associated with org with entityId ${orgEntityId} has already been used.`;
        throw new ApolloError(msg, "INVITATION_ALREADY_USED");
      }
    }

    await user.joinOrg(client)({ org, responsibility });

    await invitation.use(client);

    return user.toGQLUnknownEntity();
  });
