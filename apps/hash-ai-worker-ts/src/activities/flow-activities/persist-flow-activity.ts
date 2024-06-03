import { getFlowRunEntityById } from "@local/hash-backend-utils/flows";
import type { AccountId } from "@local/hash-graph-types/account";
import type { OwnedById } from "@local/hash-graph-types/web";
import { mapFlowRunToEntityProperties } from "@local/hash-isomorphic-utils/flows/mappings";
import type { LocalFlowRun } from "@local/hash-isomorphic-utils/flows/types";
import { createDefaultAuthorizationRelationships } from "@local/hash-isomorphic-utils/graph-queries";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import { graphApiClient } from "../shared/graph-api-client";

type PersistFlowActivityParams = {
  flow: LocalFlowRun;
  userAuthentication: { actorId: AccountId };
  webId: OwnedById;
};

export const persistFlowActivity = async (
  params: PersistFlowActivityParams,
) => {
  const { flow, userAuthentication, webId } = params;

  const { flowRunId } = flow;

  const flowRunProperties = mapFlowRunToEntityProperties(flow);

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
          value: flowRunProperties,
        },
      ],
    });
  } else {
    await graphApiClient.createEntity(userAuthentication.actorId, {
      ownedById: webId,
      entityUuid: flowRunId,
      entityTypeIds: [systemEntityTypes.flowRun.entityTypeId],
      properties: flowRunProperties,
      draft: false,
      relationships:
        createDefaultAuthorizationRelationships(userAuthentication),
    });
  }
};
