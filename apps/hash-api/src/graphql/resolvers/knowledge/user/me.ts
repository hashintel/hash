import { splitEntityId } from "@blockprotocol/type-system";
import {
  queryEntitySubgraph,
  serializeQueryEntitySubgraphResponse,
} from "@local/hash-graph-sdk/entity";
import {
  currentTimeInstantTemporalAxes,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";

import type { Query, QueryMeArgs, ResolverFn } from "../../../api-types.gen";
import type { LoggedInGraphQLContext } from "../../../context";
import { graphQLContextToImpureGraphContext } from "../../util";

export const meResolver: ResolverFn<
  Query["me"],
  Record<string, never>,
  LoggedInGraphQLContext,
  QueryMeArgs
> = async (_, { hasLeftEntity, hasRightEntity }, graphQLContext, __) => {
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
      graphResolveDepths: {
        ...zeroedGraphResolveDepths,
        hasLeftEntity,
        hasRightEntity,
      },
      temporalAxes: currentTimeInstantTemporalAxes,
      includeDrafts: false,
      includePermissions: false,
    },
  ).then(serializeQueryEntitySubgraphResponse);

  return {
    subgraph,
    userPermissionsOnEntities: entityPermissions!,
  };
};
