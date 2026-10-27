import { mapOpenInputRequestsToEntityProperty } from "@local/hash-isomorphic-utils/flows/mappings";
import {
  systemEntityTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";

import { getFlowRunEntityByWorkflowId } from "../../shared/get-flow-run-entity-by-workflow-id.js";

import type { ActorEntityUuid } from "@blockprotocol/type-system";
import type { GraphApi } from "@local/hash-graph-client";
import type { ExternalInputRequest } from "@local/hash-isomorphic-utils/flows/types";

export type SaveOpenInputRequestsActivityParams = {
  openInputRequests: ExternalInputRequest[];
  temporalWorkflowId: string;
  userAuthentication: { actorId: ActorEntityUuid };
};

/**
 * Replaces the open input requests saved on a run's entity, so that lists of runs can show them without reading the
 * run's history.
 */
export const saveOpenInputRequestsActivity = async (
  params: SaveOpenInputRequestsActivityParams & { graphApiClient: GraphApi },
): Promise<void> => {
  const {
    graphApiClient,
    openInputRequests,
    temporalWorkflowId,
    userAuthentication,
  } = params;

  const flowRunEntity = await getFlowRunEntityByWorkflowId({
    graphApiClient,
    temporalWorkflowId,
    userAuthentication,
  });

  if (!flowRunEntity) {
    throw new Error(`Run ${temporalWorkflowId} has no entity to save to`);
  }

  const flowRunEntityTypeId = systemEntityTypes.flowRun.entityTypeId;

  await flowRunEntity.patch(graphApiClient, userAuthentication, {
    /* An entity of an earlier `Flow Run` type, which has no open input requests, is upgraded to one that has them. */
    ...(flowRunEntity.metadata.entityTypeIds.includes(flowRunEntityTypeId)
      ? {}
      : { entityTypeIds: [flowRunEntityTypeId] }),
    propertyPatches: [
      {
        op: "add",
        path: [systemPropertyTypes.openInputRequest.propertyTypeBaseUrl],
        property: mapOpenInputRequestsToEntityProperty(openInputRequests),
      },
    ],
    provenance: {
      actorType: "machine",
      origin: {
        type: "flow",
        id: flowRunEntity.metadata.recordId.entityId,
      },
    },
  });
};
