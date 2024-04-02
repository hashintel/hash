import type { Filter, GraphApi } from "@local/hash-graph-client";
import {
  currentTimeInstantTemporalAxes,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import { mapGraphApiSubgraphToSubgraph } from "@local/hash-isomorphic-utils/subgraph-mapping";
import type { AccountId, Entity, EntityRootType } from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";

export const getEntityByFilter = async ({
  actorId,
  graphApiClient,
  filter,
}: {
  actorId: AccountId;
  graphApiClient: GraphApi;
  filter: Filter;
}): Promise<Entity | undefined> => {
  const matchedEntities = await graphApiClient
    .getEntitiesByQuery(actorId, {
      query: {
        filter,
        graphResolveDepths: zeroedGraphResolveDepths,
        temporalAxes: currentTimeInstantTemporalAxes,
        includeDrafts: true,
      },
    })
    .then(({ data }) => {
      const subgraph = mapGraphApiSubgraphToSubgraph<EntityRootType>(
        data.subgraph,
        actorId,
      );

      return getRoots(subgraph);
    });

  return matchedEntities[0];
};
