import type { ActorEntityUuid } from "@blockprotocol/type-system";
import type { Filter, GraphApi } from "@local/hash-graph-client";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import { mapGraphApiEntityToEntity } from "@local/hash-graph-sdk/subgraph";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";

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
}): Promise<HashEntity | undefined> => {
  const matchedEntities = await graphApiClient
    .queryEntities(actorId, {
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
