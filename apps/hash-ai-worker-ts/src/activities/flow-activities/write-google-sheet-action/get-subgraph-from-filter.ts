import type { EntityRootType } from "@blockprotocol/graph";
import type { ActorEntityUuid } from "@blockprotocol/type-system";
import type { Filter, GraphApi } from "@local/hash-graph-client";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import { mapGraphApiSubgraphToSubgraph } from "@local/hash-graph-sdk/subgraph";
import {
  currentTimeInstantTemporalAxes,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";

export const getSubgraphFromFilter = async ({
  authentication,
  filter,
  graphApiClient,
  traversalDepth,
}: {
  authentication: { actorId: ActorEntityUuid };
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

  return mapGraphApiSubgraphToSubgraph<EntityRootType<HashEntity>>(
    response.data.subgraph,
    authentication.actorId,
  );
};
