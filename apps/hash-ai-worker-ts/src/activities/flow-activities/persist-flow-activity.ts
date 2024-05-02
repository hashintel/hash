import type { GraphApi } from "@local/hash-graph-client";
import { mapFlowToEntityProperties } from "@local/hash-isomorphic-utils/flows/mappings";
import type { Flow } from "@local/hash-isomorphic-utils/flows/types";
import {
  createDefaultAuthorizationRelationships,
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
} from "@local/hash-isomorphic-utils/graph-queries";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { mapGraphApiEntityToEntity } from "@local/hash-isomorphic-utils/subgraph-mapping";
import type { FlowProperties } from "@local/hash-isomorphic-utils/system-types/flow";
import type { AccountId, Entity, EntityUuid } from "@local/hash-subgraph";

import { getFlowContext } from "../shared/get-flow-context";

type PersistFlowActivityParams = {
  flow: Flow;
  userAuthentication: { actorId: AccountId };
};

const getExistingFlowEntity = async (params: {
  graphApiClient: GraphApi;
  flowId: EntityUuid;
  userAuthentication: { actorId: AccountId };
}): Promise<Entity<FlowProperties> | null> => {
  const { flowId, userAuthentication, graphApiClient } = params;

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

export const persistFlowActivity = async (
  params: PersistFlowActivityParams,
) => {
  const { flow, userAuthentication } = params;

  const { graphApiClient } = await getFlowContext();

  const { flowId } = flow;

  const flowProperties = mapFlowToEntityProperties(flow);

  const existingFlowEntity = await getExistingFlowEntity({
    graphApiClient,
    flowId,
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
      entityUuid: flowId,
      entityTypeIds: [systemEntityTypes.flow.entityTypeId],
      properties: flowProperties,
      draft: false,
      relationships:
        createDefaultAuthorizationRelationships(userAuthentication),
    });
  }
};
