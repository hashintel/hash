import { splitEntityId } from "@blockprotocol/type-system";
import { type HashEntity, queryEntities } from "@local/hash-graph-sdk/entity";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import type { ActorEntityUuid, EntityId } from "@blockprotocol/type-system";
import type { GraphApi } from "@local/hash-graph-client";
import type { FlowRun as FlowRunEntity } from "@local/hash-isomorphic-utils/system-types/shared";

/**
 * A flow run's entity, if the user can view it.
 */
export const getFlowRunEntityById = async (params: {
  flowRunEntityId: EntityId;
  graphApiClient: GraphApi;
  userAuthentication: { actorId: ActorEntityUuid };
}): Promise<HashEntity<FlowRunEntity> | null> => {
  const { flowRunEntityId, graphApiClient, userAuthentication } = params;

  const [webId, entityUuid] = splitEntityId(flowRunEntityId);

  const {
    entities: [existingFlowEntity],
  } = await queryEntities<FlowRunEntity>(
    { graphApi: graphApiClient },
    userAuthentication,
    {
      filter: {
        all: [
          { equal: [{ path: ["webId"] }, { parameter: webId }] },
          { equal: [{ path: ["uuid"] }, { parameter: entityUuid }] },
          {
            equal: [
              { path: ["type", "baseUrl"] },
              {
                parameter: systemEntityTypes.flowRun.entityTypeBaseUrl,
              },
            ],
          },
        ],
      },
      temporalAxes: currentTimeInstantTemporalAxes,
      includeDrafts: false,
      includePermissions: false,
    },
  );

  return existingFlowEntity ?? null;
};
