import type { MultiFilter } from "@blockprotocol/graph";
import { convertBpFilterToGraphFilter } from "@local/hash-backend-utils/convert-bp-filter-to-graph-filter";
import type { GraphApi } from "@local/hash-graph-client";
import {
  currentTimeInstantTemporalAxes,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import { QueryProperties } from "@local/hash-isomorphic-utils/system-types/blockprotocol/query";
import type {
  AccountId,
  Entity,
  EntityId,
  EntityRootType,
  Subgraph,
} from "@local/hash-subgraph";
import { mapGraphApiSubgraphToSubgraph } from "@local/hash-subgraph/stdlib";

import { getLatestEntityById } from "./shared/graph-requests";

export const getSubgraphFromBlockProtocolQueryEntity = async ({
  authentication,
  graphApiClient,
  queryEntityId,
}: {
  authentication: { actorId: AccountId };
  graphApiClient: GraphApi;
  queryEntityId: EntityId;
}) => {
  let queryEntity: Entity<QueryProperties> | undefined;
  try {
    queryEntity = (await getLatestEntityById({
      graphApiClient,
      authentication,
      entityId: queryEntityId,
    })) as Entity<QueryProperties>;
  } catch {
    // couldn't get entity
  }

  if (!queryEntity) {
    throw new Error(`No query entity found with id ${queryEntityId}.`);
  }

  const multiFilter =
    queryEntity.properties[
      "https://blockprotocol.org/@hash/types/property-type/query/"
    ];

  const filter = convertBpFilterToGraphFilter(multiFilter as MultiFilter);

  const response = await graphApiClient.getEntitiesByQuery(
    authentication.actorId,
    {
      query: {
        filter,
        graphResolveDepths: zeroedGraphResolveDepths,
        temporalAxes: currentTimeInstantTemporalAxes,
        includeDrafts: false,
      },
    },
  );

  return mapGraphApiSubgraphToSubgraph<EntityRootType>(response.data.subgraph);
};

export const createGraphActivities = ({
  graphApiClient,
}: {
  graphApiClient: GraphApi;
}) => ({
  async getSubgraphFromBlockProtocolQueryEntity({
    authentication,
    queryEntityId,
  }: {
    authentication: { actorId: AccountId };
    queryEntityId: EntityId;
  }): Promise<Subgraph<EntityRootType>> {
    return await getSubgraphFromBlockProtocolQueryEntity({
      authentication,
      graphApiClient,
      queryEntityId,
    });
  },
});
