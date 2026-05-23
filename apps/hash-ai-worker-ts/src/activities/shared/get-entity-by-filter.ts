import { type HashEntity, queryEntities } from "@local/hash-graph-sdk/entity";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";

import type { ActorEntityUuid } from "@blockprotocol/type-system";
import type { Filter, GraphApi } from "@local/hash-graph-client";

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
  const { entities: matchedEntities } = await queryEntities(
    { graphApi: graphApiClient },
    { actorId },
    {
      filter,
      temporalAxes: currentTimeInstantTemporalAxes,
      includeDrafts,
      includePermissions: false,
    },
  );

  return matchedEntities[0];
};
