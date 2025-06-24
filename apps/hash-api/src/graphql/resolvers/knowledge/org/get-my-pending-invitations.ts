import {
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import type { PendingOrgInvitation } from "@local/hash-isomorphic-utils/graphql/api-types.gen";
import {
  systemEntityTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";

import { getEntitySubgraphResponse } from "../../../../graph/knowledge/primitive/entity";
import { systemAccountId } from "../../../../graph/system-account";
import type { ResolverFn } from "../../../api-types.gen";
import type { LoggedInGraphQLContext } from "../../../context";
import { graphQLContextToImpureGraphContext } from "../../util";
import { getPendingOrgInvitationsFromSubgraph } from "./shared";

export const getMyPendingInvitationsResolver: ResolverFn<
  Promise<PendingOrgInvitation[]>,
  Record<string, never>,
  LoggedInGraphQLContext,
  null
> = async (_, _args, graphQLContext) => {
  const { user } = graphQLContext;

  /**
   * The system account is used to manage invitations on behalf of the user,
   * because the user does not have permissions on them,
   * to avoid accidentally leaking their identity before they have accepted the invitation.
   *
   * Otherwise an org admin could issue an invitation to an email address and check which user was given permission on the invitation.
   */
  const systemAccountAuthentication = {
    actorId: systemAccountId,
  };

  const context = graphQLContextToImpureGraphContext(graphQLContext);

  try {
    const { subgraph: invitationSubgraph } = await getEntitySubgraphResponse(
      context,
      systemAccountAuthentication,
      {
        includeDrafts: false,
        temporalAxes: currentTimeInstantTemporalAxes,
        filter: {
          all: [
            generateVersionedUrlMatchingFilter(
              systemEntityTypes.invitation.entityTypeId,
            ),
            {
              any: [
                {
                  equal: [
                    {
                      path: [
                        "properties",
                        systemPropertyTypes.email.propertyTypeBaseUrl,
                      ],
                    },
                    { parameter: user.emails[0] },
                  ],
                },
                {
                  equal: [
                    {
                      path: [
                        "properties",
                        systemPropertyTypes.shortname.propertyTypeBaseUrl,
                      ],
                    },
                    { parameter: user.shortname },
                  ],
                },
              ],
            },
          ],
        },
        graphResolveDepths: {
          ...zeroedGraphResolveDepths,
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

    return pendingInvitations;
  } catch {
    return [];
  }
};
