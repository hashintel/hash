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
    const { orgEntityId, verification, responsibility } = args;

    const org = await Org.getOrgById(client)({ entityId: orgEntityId });

    if (!org) {
      const msg = `Org with entityId ${orgEntityId} not found in datastore`;
      throw new ApolloError(msg, "ORG_NOT_FOUND");
    }

    const { invitationLinkToken, invitationEmailToken } = verification;

    const invitation = invitationLinkToken
      ? await org.getInvitationLinkWithToken(client)({
          invitationLinkToken,
          errorCodePrefix: "INVITATION_",
        })
      : invitationEmailToken
      ? await org.getEmailInvitationWithToken(client)({
          invitationEmailToken,
          errorCodePrefix: "INVITATION_",
        })
      : null;

    if (!invitation) {
      const msg = `Either an org invitation link or email invitation token must be provided`;
      throw new ApolloError(msg);
    }

    /** @todo: verify the invitation hasn't expired */

    await user.joinOrg(client)({ org, responsibility });

    await invitation.use(client);

    if (invitation instanceof OrgEmailInvitation) {
      const { inviteeEmailAddress } = invitation.properties;
      const existingUserEmail = user.getEmail(inviteeEmailAddress);

      // If the user doesn't have an email with the inviteeEmailAddress...
      if (!existingUserEmail) {
        // ...we can create it.
        await user.addEmailAddress(client)({
          address: inviteeEmailAddress,
          primary: false,
          verified: true,
        });
        // If the user has an email with the inviteeEmailAddress that isn't verified...
      } else if (!existingUserEmail.verified) {
        // ...we can verify it.
        await user.verifyExistingEmailAddress(client)(inviteeEmailAddress);
      }
    }

    return user.toGQLUnknownEntity();
  });
