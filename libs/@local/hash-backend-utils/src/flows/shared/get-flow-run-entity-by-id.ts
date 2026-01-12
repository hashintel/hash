import type { ActorEntityUuid, EntityUuid } from "@blockprotocol/type-system";
import type { GraphApi } from "@local/hash-graph-client";
import { type HashEntity, queryEntities } from "@local/hash-graph-sdk/entity";
import {
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
} from "@local/hash-isomorphic-utils/graph-queries";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import type { FlowRun as FlowRunEntity } from "@local/hash-isomorphic-utils/system-types/shared";

export const getFlowRunEntityById = async (params: {
  flowRunId: EntityUuid;
  graphApiClient: GraphApi;
  userAuthentication: { actorId: ActorEntityUuid };
}): Promise<HashEntity<FlowRunEntity> | null> => {
  const { flowRunId, graphApiClient, userAuthentication } = params;

  const {
    entities: [existingFlowEntity],
  } = await queryEntities<FlowRunEntity>(
    { graphApi: graphApiClient },
    userAuthentication,
    {
      filter: {
        all: [
          {
            equal: [{ path: ["uuid"] }, { parameter: flowRunId }],
          },
          generateVersionedUrlMatchingFilter(
            systemEntityTypes.flowRun.entityTypeId,
            { ignoreParents: true },
          ),
        ],
      },
      temporalAxes: currentTimeInstantTemporalAxes,
      includeDrafts: false,
      includePermissions: false,
    },
  );

  return existingFlowEntity ?? null;
};
