import { ApolloError } from "apollo-server-errors";
import { MutationJoinOrgArgs, ResolverFn } from "../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../context";
import { UnresolvedGQLUser } from "./util";

export const joinOrg: ResolverFn<
  Promise<UnresolvedGQLUser>,
  {},
  LoggedInGraphQLContext,
  MutationJoinOrgArgs
> = async (_, _args, { dataSources }) =>
  dataSources.db.transaction(async (_client) => {
    throw new ApolloError("The joinOrg mutation is unimplemented");

    // const { orgEntityId, verification, responsibility } = args;
    // const { graphApi } = dataSources;

    // /** @todo: potentially deprecate these method calls depending on Graph API transaction implementation */
    // await user.acquireLock(client);

    // await user.refetchLatestVersion(client);

    // const org = await OrgModel.getOrgById(graphApi, { entityId: orgEntityId });

    // if (!org) {
    //   const msg = `Org with entityId ${orgEntityId} not found in datastore`;
    //   throw new ApolloError(msg, "ORG_NOT_FOUND");
    // }

    // const { invitationLinkToken, invitationEmailToken } = verification;

    // /**
    //  * @todo: potentially deprecate these method calls depending on the org invitation
    //  * implementation (@see https://app.asana.com/0/1202805690238892/1202980861294704/f)
    //  */
    // const invitation = invitationLinkToken
    //   ? await org.getInvitationLinkWithToken(client, {
    //       invitationLinkToken,
    //       errorCodePrefix: "INVITATION_",
    //     })
    //   : invitationEmailToken
    //   ? await org.getEmailInvitationWithToken(client, {
    //       invitationEmailToken,
    //       errorCodePrefix: "INVITATION_",
    //     })
    //   : null;

    // if (!invitation) {
    //   const msg = `Either an org invitation link or email invitation token must be provided`;
    //   throw new ApolloError(msg);
    // }

    // /** @todo: verify the invitation hasn't expired */

    // await user.joinOrg(graphApi, {
    //   org,
    //   responsibility,
    // });

    // await invitation.use(client, user.accountId);

    // /** @todo: potentially deprecate this depending on re-implemented invitation flow */
    // if (invitation instanceof OrgEmailInvitation) {
    //   const { inviteeEmailAddress } = invitation.properties;
    //   const existingUserEmail = user.getEmail(inviteeEmailAddress);

    //   // If the user doesn't have an email with the inviteeEmailAddress...
    //   if (!existingUserEmail) {
    //     // ...we can create it.
    //     await user.addEmailAddress(client, {
    //       updatedByAccountId: user.accountId,
    //       email: {
    //         address: inviteeEmailAddress,
    //         primary: false,
    //         verified: true,
    //       },
    //     });
    //     // If the user has an email with the inviteeEmailAddress that isn't verified...
    //   } else if (!existingUserEmail.verified) {
    //     // ...we can verify it.
    //     await user.verifyExistingEmailAddress(client, {
    //       updatedByAccountId: user.accountId,
    //       emailAddress: inviteeEmailAddress,
    //     });
    //   }
    // }

    // return mapUserModelToGQL(user);
  });
