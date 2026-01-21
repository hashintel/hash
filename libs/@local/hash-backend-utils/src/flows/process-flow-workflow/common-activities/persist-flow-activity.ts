import type {
  ActorEntityUuid,
  EntityId,
  OriginProvenance,
  ProvidedEntityEditionProvenance,
  WebId,
} from "@blockprotocol/type-system";
import type { GraphApi } from "@local/hash-graph-client";
import { HashEntity, queryEntities } from "@local/hash-graph-sdk/entity";
import { mapFlowRunToEntityProperties } from "@local/hash-isomorphic-utils/flows/mappings";
import type { LocalFlowRun } from "@local/hash-isomorphic-utils/flows/types";
import {
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
} from "@local/hash-isomorphic-utils/graph-queries";
import {
  systemEntityTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import type {
  FlowRun,
  FlowRun as FlowRunEntity,
} from "@local/hash-isomorphic-utils/system-types/shared";

export type PersistFlowActivityParams = {
  flow: LocalFlowRun;
  stepIds: string[];
  userAuthentication: { actorId: ActorEntityUuid };
  webId: WebId;
};

export const persistFlowActivity = async (
  params: PersistFlowActivityParams & { graphApiClient: GraphApi },
): Promise<{ flowEntityId: EntityId }> => {
  const { flow, graphApiClient, stepIds, userAuthentication, webId } = params;

  const { temporalWorkflowId } = flow;

  const flowRunProperties = mapFlowRunToEntityProperties(flow);

  const {
    entities: [existingFlowEntity],
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

  if (existingFlowEntity) {
    const flowEntityId = existingFlowEntity.metadata.recordId.entityId;

    const provenance: ProvidedEntityEditionProvenance = {
      actorType: "machine",
      origin: {
        type: "flow",
        id: flowEntityId,
        stepIds,
      } satisfies OriginProvenance,
    };

    await existingFlowEntity.patch(graphApiClient, userAuthentication, {
      propertyPatches: [
        {
          op: "replace",
          path: [],
          property: flowRunProperties,
        },
      ],
      provenance,
    });

    return { flowEntityId };
  }

  const provenance: ProvidedEntityEditionProvenance = {
    actorType: "machine",
    origin: {
      type: "flow",
    } satisfies OriginProvenance,
  };

  const newEntity = await HashEntity.create<FlowRun>(
    graphApiClient,
    userAuthentication,
    {
      webId,
      entityTypeIds: [systemEntityTypes.flowRun.entityTypeId],
      properties: flowRunProperties,
      provenance,
      draft: false,
    },
  );

  return { flowEntityId: newEntity.metadata.recordId.entityId };
};
