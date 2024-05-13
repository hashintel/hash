import type { GraphApi } from "@local/hash-graph-client";
import {
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
} from "@local/hash-isomorphic-utils/graph-queries";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { mapGraphApiEntityToEntity } from "@local/hash-isomorphic-utils/subgraph-mapping";
import type { FlowProperties } from "@local/hash-isomorphic-utils/system-types/shared";
import type { AccountId, Entity, EntityUuid } from "@local/hash-subgraph";

export const getFlowById = async (params: {
  flowId: EntityUuid;
  graphApiClient: GraphApi;
  userAuthentication: { actorId: AccountId };
}): Promise<Entity<FlowProperties> | null> => {
  const { flowId, graphApiClient, userAuthentication } = params;

  const [existingFlowEntity] = await graphApiClient
    .getEntities(userAuthentication.actorId, {
      filter: {
        all: [
          {
            equal: [{ path: ["uuid"] }, { parameter: flowId }],
          },
          generateVersionedUrlMatchingFilter(
            systemEntityTypes.flow.entityTypeId,
            { ignoreParents: true },
          ),
        ],
      },
      temporalAxes: currentTimeInstantTemporalAxes,
      includeDrafts: false,
    })
    .then(({ data: response }) =>
      response.entities.map(
        (entity) =>
          mapGraphApiEntityToEntity(
            entity,
            userAuthentication.actorId,
          ) as Entity<FlowProperties>,
      ),
    );

  return existingFlowEntity ?? null;
};
