import { getFlowRunEntityById } from "@local/hash-backend-utils/flows";
import { Entity } from "@local/hash-graph-sdk/entity";
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
    await existingFlowEntity.patch(graphApiClient, userAuthentication, {
      properties: [
        {
          op: "replace",
          path: [],
          value: flowRunProperties,
        },
      ],
    });
  } else {
    await Entity.create(graphApiClient, userAuthentication, {
      ownedById: webId,
      entityUuid: flowRunId,
      entityTypeId: systemEntityTypes.flowRun.entityTypeId,
      properties: flowRunProperties,
      draft: false,
      relationships:
        createDefaultAuthorizationRelationships(userAuthentication),
    });
  }
};
