import type { PendingOrgInvitation } from "@local/hash-isomorphic-utils/graphql/api-types.gen";

import { getLatestEntityRootedSubgraph } from "../../../../graph/knowledge/primitive/entity";
import { systemAccountId } from "../../../../graph/system-account";
import type {
  QueryGetPendingInvitationByEntityIdArgs,
  ResolverFn,
} from "../../../api-types.gen";
import type { LoggedInGraphQLContext } from "../../../context";
import { graphQLContextToImpureGraphContext } from "../../util";
import { getPendingOrgInvitationsFromSubgraph } from "./shared";

/**
 * This resolver is used specifically to get an invitation to an organization issued to a user not yet signed up for HASH.
 * They will be emailed a link to sign up, which includes the entityId, and we need to retrieve it to show the invitation details on the signup page.
 * We cannot have any authentication gate on this as the user does not have an account, but the security risk is minimal
 * – the user needs to have id, and it's vanishingly unlikely anyone can guess a webUuid–uuid combo that happens to match an active one.
 */
export const getPendingInvitationByEntityIdResolver: ResolverFn<
  PendingOrgInvitation | null,
  Record<string, never>,
  LoggedInGraphQLContext,
  QueryGetPendingInvitationByEntityIdArgs
> = async (_, { entityId }, graphQLContext) => {
  const systemAccountAuthentication = {
    actorId: systemAccountId,
  };

  const context = graphQLContextToImpureGraphContext(graphQLContext);

  const invitationSubgraph = await getLatestEntityRootedSubgraph(
    context,
    systemAccountAuthentication,
    {
      entityId,
      traversalPaths: [
        {
          edges: [
            {
              kind: "has-right-entity",
              direction: "incoming",
            },
            {
              kind: "has-left-entity",
              direction: "outgoing",
            },
          ],
        },
      ],
    },
  );

  const pendingInvitations = await getPendingOrgInvitationsFromSubgraph(
    context,
    systemAccountAuthentication,
    invitationSubgraph,
  );

  return pendingInvitations[0] ?? null;
};
