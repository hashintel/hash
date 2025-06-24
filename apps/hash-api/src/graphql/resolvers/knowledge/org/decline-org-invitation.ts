import type { MutationDeclineOrgInvitationArgs } from "@local/hash-isomorphic-utils/graphql/api-types.gen";
import { ApolloError } from "apollo-server-errors";

import { getLatestEntityRootedSubgraph } from "../../../../graph/knowledge/primitive/entity";
import { systemAccountId } from "../../../../graph/system-account";
import type { ResolverFn } from "../../../api-types.gen";
import type { LoggedInGraphQLContext } from "../../../context";
import { graphQLContextToImpureGraphContext } from "../../util";
import { getPendingOrgInvitationsFromSubgraph } from "./shared";

/**
 * This resolver is used specifically to get an invitation to an organization issued to a user not yet signed up for HASH.
 * They will be emailed a link to sign up, which includes the entityId, and we need to retrieve it to show the invitation details on the signup page.
 * We cannot have any authentication gate on this as the user does not have an account, but the security risk is minimal
 * – the user needs to have id, and it's vanishingly unlikely anyone can guess a webUuid–uuid combo that happens to match an active one.
 */
export const declineOrgInvitationResolver: ResolverFn<
  Promise<boolean>,
  Record<string, never>,
  LoggedInGraphQLContext,
  MutationDeclineOrgInvitationArgs
> = async (_, { orgInvitationEntityId }, graphQLContext) => {
  const { user } = graphQLContext;

  const systemAccountAuthentication = {
    actorId: systemAccountId,
  };

  const context = graphQLContextToImpureGraphContext(graphQLContext);

  const invitationSubgraph = await getLatestEntityRootedSubgraph(
    context,
    systemAccountAuthentication,
    {
      entityId: orgInvitationEntityId,
      graphResolveDepths: {
        hasLeftEntity: {
          incoming: 0,
          outgoing: 1,
        },
        hasRightEntity: {
          incoming: 1,
          outgoing: 0,
        },
      },
    },
  );

  const pendingInvitations = await getPendingOrgInvitationsFromSubgraph(
    context,
    systemAccountAuthentication,
    invitationSubgraph,
  );

  const invitation = pendingInvitations[0] ?? null;

  if (!invitation) {
    throw new ApolloError("Invitation not found", "NOT_FOUND");
  }

  if ("email" in invitation) {
    if (!user.emails.includes(invitation.email)) {
      throw new ApolloError("Invitation for user not found", "NOT_FOUND");
    }
  } else if ("shortname" in invitation) {
    if (user.shortname !== invitation.shortname) {
      throw new ApolloError("Invitation for user not found", "NOT_FOUND");
    }
  }

  await Promise.all([
    invitation.invitationEntity.archive(
      context.graphApi,
      systemAccountAuthentication,
      context.provenance,
    ),
    invitation.linkEntity.archive(
      context.graphApi,
      systemAccountAuthentication,
      context.provenance,
    ),
  ]);

  return true;
};
