import { mapOpenInputRequestsToEntityProperty } from "@local/hash-isomorphic-utils/flows/mappings";
import { systemPropertyTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import { getFlowRunEntityByWorkflowId } from "./get-flow-run-entity-by-workflow-id.js";

import type { ActorEntityUuid } from "@blockprotocol/type-system";
import type { GraphApi } from "@local/hash-graph-client";
import type { ExternalInputRequest } from "@local/hash-isomorphic-utils/flows/types";

export type SaveOpenInputRequestsParams = {
  openInputRequests: ExternalInputRequest[];
  temporalWorkflowId: string;
  userAuthentication: { actorId: ActorEntityUuid };
};

/**
 * Replaces the open input requests saved on a run's entity, so that lists of runs can show them without reading the
 * run's history.
 */
export const saveOpenInputRequests = async ({
  graphApiClient,
  openInputRequests,
  temporalWorkflowId,
  userAuthentication,
}: SaveOpenInputRequestsParams & {
  graphApiClient: GraphApi;
}): Promise<void> => {
  const flowRunEntity = await getFlowRunEntityByWorkflowId({
    graphApiClient,
    temporalWorkflowId,
    userAuthentication,
  });

  if (!flowRunEntity) {
    throw new Error(`Run ${temporalWorkflowId} has no entity to save to`);
  }

  await flowRunEntity.patch(graphApiClient, userAuthentication, {
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
