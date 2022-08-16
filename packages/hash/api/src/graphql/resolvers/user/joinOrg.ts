import { ApolloError } from "apollo-server-errors";
import { MutationJoinOrgArgs, Resolver } from "../../apiTypes.gen";
import { Org, OrgEmailInvitation } from "../../../model";
import { LoggedInGraphQLContext } from "../../context";
import { mapUserModelToGQL, UnresolvedGQLUser } from "./util";

export const joinOrg: Resolver<
  Promise<UnresolvedGQLUser>,
  {},
  LoggedInGraphQLContext,
  MutationJoinOrgArgs
> = async (_, args, { dataSources, user }) =>
  dataSources.db.transaction(async (client) => {
    const { orgEntityId, verification, responsibility } = args;
    const { graphApi } = dataSources;

    /** @todo: potentially deprecate these method calls depending on Graph API transaction implementation */
    await (user as any).acquireLock(client);

    await (user as any).refetchLatestVersion(client);

    const org = await Org.getOrgById(client, { entityId: orgEntityId });

    if (!org) {
      const msg = `Org with entityId ${orgEntityId} not found in datastore`;
      throw new ApolloError(msg, "ORG_NOT_FOUND");
    }

    const { invitationLinkToken, invitationEmailToken } = verification;

    const invitation = invitationLinkToken
      ? await org.getInvitationLinkWithToken(client, {
          invitationLinkToken,
          errorCodePrefix: "INVITATION_",
        })
      : invitationEmailToken
      ? await org.getEmailInvitationWithToken(client, {
          invitationEmailToken,
          errorCodePrefix: "INVITATION_",
        })
      : null;

    if (!invitation) {
      const msg = `Either an org invitation link or email invitation token must be provided`;
      throw new ApolloError(msg);
    }

    /** @todo: verify the invitation hasn't expired */

    await user.joinOrg(graphApi, {
      updatedByAccountId: user.accountId,
      org,
      responsibility,
    });

    await invitation.use(client, user.accountId);

    /** @todo: potentially deprecate this depending on re-implemented invitation flow */
    if (invitation instanceof OrgEmailInvitation) {
      const { inviteeEmailAddress } = invitation.properties;
      const existingUserEmail = (user as any).getEmail(inviteeEmailAddress);

      // If the user doesn't have an email with the inviteeEmailAddress...
      if (!existingUserEmail) {
        // ...we can create it.
        await (user as any).addEmailAddress(client, {
          updatedByAccountId: user.accountId,
          email: {
            address: inviteeEmailAddress,
            primary: false,
            verified: true,
          },
        });
        // If the user has an email with the inviteeEmailAddress that isn't verified...
      } else if (!existingUserEmail.verified) {
        // ...we can verify it.
        await (user as any).verifyExistingEmailAddress(client, {
          updatedByAccountId: user.accountId,
          emailAddress: inviteeEmailAddress,
        });
      }
    }

    return mapUserModelToGQL(user);
  });
