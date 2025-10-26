import { splitEntityId } from "@blockprotocol/type-system";
import {
  queryEntitySubgraph,
  serializeQueryEntitySubgraphResponse,
} from "@local/hash-graph-sdk/entity";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";

import type { Query, ResolverFn } from "../../../api-types.gen";
import type { LoggedInGraphQLContext } from "../../../context";
import { graphQLContextToImpureGraphContext } from "../../util";

export const meResolver: ResolverFn<
  Query["me"],
  Record<string, never>,
  LoggedInGraphQLContext,
  Record<string, never>
> = async (_, __, graphQLContext, ___) => {
  const [webId, entityUuid, draftId] = splitEntityId(
    graphQLContext.user.entity.metadata.recordId.entityId,
  );

  const { subgraph, entityPermissions } = await queryEntitySubgraph(
    graphQLContextToImpureGraphContext(graphQLContext),
    graphQLContext.authentication,
    {
      filter: {
        all: [
          {
            equal: [{ path: ["webId"] }, { parameter: webId }],
          },
          {
            equal: [{ path: ["uuid"] }, { parameter: entityUuid }],
          },
          { equal: [{ path: ["archived"] }, { parameter: false }] },
          ...(draftId
            ? [
                {
                  equal: [{ path: ["draftId"] }, { parameter: draftId }],
                },
              ]
            : []),
        ],
      },
      // fetch the user's org memberships and the orgs they link to
      // we fetch more information on the orgs as a follow-up, in the auth context
      traversalPaths: [
        {
          edges: [
            {
              kind: "has-left-entity",
              direction: "incoming",
            },
            {
              kind: "has-right-entity",
              direction: "outgoing",
            },
          ],
        },
      ],
      temporalAxes: currentTimeInstantTemporalAxes,
      includeDrafts: !!draftId,
      includePermissions: false,
    },
  ).then(serializeQueryEntitySubgraphResponse);

  return {
    subgraph,
    userPermissionsOnEntities: entityPermissions!,
  };
};
