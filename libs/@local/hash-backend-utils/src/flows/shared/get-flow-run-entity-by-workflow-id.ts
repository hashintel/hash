import { type HashEntity, queryEntities } from "@local/hash-graph-sdk/entity";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";
import {
  systemEntityTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";

import type { ActorEntityUuid } from "@blockprotocol/type-system";
import type { GraphApi } from "@local/hash-graph-client";
import type { FlowRun as FlowRunEntity } from "@local/hash-isomorphic-utils/system-types/shared";

/**
 * The entity of the flow run with the given Temporal workflow id, if it has been created and the user can view it.
 */
export const getFlowRunEntityByWorkflowId = async (params: {
  graphApiClient: GraphApi;
  temporalWorkflowId: string;
  userAuthentication: { actorId: ActorEntityUuid };
}): Promise<HashEntity<FlowRunEntity> | null> => {
  const { graphApiClient, temporalWorkflowId, userAuthentication } = params;

  const {
    entities: [flowRunEntity],
  } = await queryEntities<FlowRunEntity>(
    { graphApi: graphApiClient },
    userAuthentication,
    {
      filter: {
        all: [
          {
            equal: [
              {
                path: [
                  "properties",
                  systemPropertyTypes.workflowId.propertyTypeBaseUrl,
                ],
              },
              { parameter: temporalWorkflowId },
            ],
          },
          {
            equal: [
              { path: ["type", "baseUrl"] },
              { parameter: systemEntityTypes.flowRun.entityTypeBaseUrl },
            ],
          },
        ],
      },
      temporalAxes: currentTimeInstantTemporalAxes,
      includeDrafts: false,
      includePermissions: false,
    },
  );

  return flowRunEntity ?? null;
};
