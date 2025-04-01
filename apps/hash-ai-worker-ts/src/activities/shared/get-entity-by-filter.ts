import type { ActorEntityUuid } from "@blockprotocol/type-system";
import type { Filter, GraphApi } from "@local/hash-graph-client";
import type { Entity } from "@local/hash-graph-sdk/entity";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";
import { mapGraphApiEntityToEntity } from "@local/hash-isomorphic-utils/subgraph-mapping";

export const getEntityByFilter = async ({
  actorId,
  graphApiClient,
  filter,
  includeDrafts,
}: {
  actorId: ActorEntityUuid;
  graphApiClient: GraphApi;
  filter: Filter;
  includeDrafts: boolean;
}): Promise<Entity | undefined> => {
  const matchedEntities = await graphApiClient
    .getEntities(actorId, {
      filter,
      temporalAxes: currentTimeInstantTemporalAxes,
      includeDrafts,
    })
    .then(({ data: response }) =>
      response.entities.map((entity) =>
        mapGraphApiEntityToEntity(entity, actorId),
      ),
    );

  return matchedEntities[0];
};
