import type { GraphApi } from "@local/hash-graph-client";
import { mapFlowToEntityProperties } from "@local/hash-isomorphic-utils/flows/mappings";
import type { Flow } from "@local/hash-isomorphic-utils/flows/types";
import {
  createDefaultAuthorizationRelationships,
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import type { FlowProperties } from "@local/hash-isomorphic-utils/system-types/flow";
import type {
  AccountId,
  Entity,
  EntityRootType,
  EntityUuid,
} from "@local/hash-subgraph";
import {
  getRoots,
  mapGraphApiSubgraphToSubgraph,
} from "@local/hash-subgraph/stdlib";

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
    .getEntitiesByQuery(userAuthentication.actorId, {
      query: {
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
        graphResolveDepths: zeroedGraphResolveDepths,
        temporalAxes: currentTimeInstantTemporalAxes,
        includeDrafts: false,
      },
    })
    .then(({ data }) => {
      const subgraph = mapGraphApiSubgraphToSubgraph<EntityRootType>(
        data.subgraph,
      );

      return getRoots(subgraph) as Entity<FlowProperties>[];
    });

  return existingFlowEntity ?? null;
};

export const createPersistFlowActivity =
  ({ graphApiClient }: { graphApiClient: GraphApi }) =>
  async (params: PersistFlowActivityParams) => {
    const { flow, userAuthentication } = params;

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
            path: "",
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
