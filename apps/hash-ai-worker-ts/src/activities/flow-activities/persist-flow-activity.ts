import { getFlowRunEntityById } from "@local/hash-backend-utils/flows";
import { mapFlowToEntityProperties } from "@local/hash-isomorphic-utils/flows/mappings";
import type { Flow } from "@local/hash-isomorphic-utils/flows/types";
import { createDefaultAuthorizationRelationships } from "@local/hash-isomorphic-utils/graph-queries";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import type { AccountId } from "@local/hash-subgraph";

import { graphApiClient } from "../shared/graph-api-client";

type PersistFlowActivityParams = {
  flow: Flow;
  userAuthentication: { actorId: AccountId };
};

export const persistFlowActivity = async (
  params: PersistFlowActivityParams,
) => {
  const { flow, userAuthentication } = params;

  const { flowRunId } = flow;

  const flowProperties = mapFlowToEntityProperties(flow);

  const existingFlowEntity = await getFlowRunEntityById({
    flowRunId,
    graphApiClient,
    userAuthentication,
  });

  if (existingFlowEntity) {
    await graphApiClient.patchEntity(userAuthentication.actorId, {
      entityId: existingFlowEntity.metadata.recordId.entityId,
      properties: [
        {
          op: "replace",
          path: [],
          value: flowProperties,
        },
      ],
    });
  } else {
    await graphApiClient.createEntity(userAuthentication.actorId, {
      ownedById: userAuthentication.actorId,
      entityUuid: flowRunId,
      entityTypeIds: [systemEntityTypes.flow.entityTypeId],
      properties: flowProperties,
      draft: false,
      relationships:
        createDefaultAuthorizationRelationships(userAuthentication),
    });
  }
};
