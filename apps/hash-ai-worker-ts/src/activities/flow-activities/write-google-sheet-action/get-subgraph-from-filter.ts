import type { Filter, GraphApi } from "@local/hash-graph-client";
import type { AccountId } from "@local/hash-graph-types/account";
import {
  currentTimeInstantTemporalAxes,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import { mapGraphApiSubgraphToSubgraph } from "@local/hash-isomorphic-utils/subgraph-mapping";
import type { EntityRootType } from "@local/hash-subgraph";

export const getSubgraphFromFilter = async ({
  authentication,
  filter,
  graphApiClient,
  traversalDepth,
}: {
  authentication: { actorId: AccountId };
  filter: Filter;
  graphApiClient: GraphApi;
  traversalDepth: number;
}) => {
  const response = await graphApiClient.getEntitySubgraph(
    authentication.actorId,
    {
      filter,
      graphResolveDepths: {
        ...zeroedGraphResolveDepths,
        isOfType: { outgoing: 255 },
        inheritsFrom: { outgoing: 255 },
        constrainsPropertiesOn: { outgoing: 255 },
        constrainsLinksOn: { outgoing: 255 },
        hasRightEntity: {
          outgoing: traversalDepth,
          incoming: traversalDepth,
        },
        hasLeftEntity: { incoming: traversalDepth, outgoing: traversalDepth },
      },
      temporalAxes: currentTimeInstantTemporalAxes,
      includeDrafts: false,
    },
  );

  return mapGraphApiSubgraphToSubgraph<EntityRootType>(
    response.data.subgraph,
    authentication.actorId,
  );
};
