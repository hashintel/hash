import {
  HashEntity,
  HashLinkEntity,
  queryEntities,
} from "@local/hash-graph-sdk/entity";
import { mapFlowRunToEntityProperties } from "@local/hash-isomorphic-utils/flows/mappings";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";
import {
  systemEntityTypes,
  systemLinkEntityTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";

import { getFlowDefinitionEntityById } from "../../shared/get-flow-definition-entity-by-id.js";

import type {
  ActorEntityUuid,
  EntityId,
  EntityUuid,
  OriginProvenance,
  ProvidedEntityEditionProvenance,
  WebId,
} from "@blockprotocol/type-system";
import type { GraphApi } from "@local/hash-graph-client";
import type { LocalFlowRun } from "@local/hash-isomorphic-utils/flows/types";
import type {
  FlowRun,
  FlowRun as FlowRunEntity,
  FlowRunTriggeredByLink,
  FlowRunUsesLink,
} from "@local/hash-isomorphic-utils/system-types/shared";

export type PersistFlowActivityParams = {
  flow: LocalFlowRun;
  flowRunId?: EntityUuid;
  /**
   * The `Flow Trigger` entity that started the run, if any (e.g. a `Flow Schedule`). Only used when the run's
   * entity is created.
   */
  flowTriggerEntityId?: EntityId;
  stepIds: string[];
  userAuthentication: { actorId: ActorEntityUuid };
  webId: WebId;
};

export const persistFlowActivity = async (
  params: PersistFlowActivityParams & { graphApiClient: GraphApi },
): Promise<{ flowEntityId: EntityId }> => {
  const {
    flow,
    flowRunId,
    flowTriggerEntityId,
    graphApiClient,
    stepIds,
    userAuthentication,
    webId,
  } = params;

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
          {
            equal: [
              {
                path: ["type", "baseUrl"],
              },
              {
                parameter: systemEntityTypes.flowRun.entityTypeBaseUrl,
              },
            ],
          },
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

  const flowDefinitionEntity = await getFlowDefinitionEntityById({
    flowDefinitionId: flow.flowDefinitionId,
    graphApiClient,
    userAuthentication,
  });

  if (!flowDefinitionEntity) {
    throw new Error(
      `No Flow Definition entity exists for flow definition ${flow.flowDefinitionId}, so its run can't link to it`,
    );
  }

  const newEntity = await HashEntity.create<FlowRun>(
    graphApiClient,
    userAuthentication,
    {
      entityUuid: flowRunId,
      webId,
      entityTypeIds: [systemEntityTypes.flowRun.entityTypeId],
      properties: flowRunProperties,
      provenance,
      draft: false,
    },
  );

  const flowEntityId = newEntity.metadata.recordId.entityId;

  await Promise.all([
    HashLinkEntity.create<FlowRunUsesLink["linkEntity"]>(
      graphApiClient,
      userAuthentication,
      {
        webId,
        entityTypeIds: [systemLinkEntityTypes.uses.linkEntityTypeId],
        properties: { value: {} },
        linkData: {
          leftEntityId: flowEntityId,
          rightEntityId: flowDefinitionEntity.metadata.recordId.entityId,
        },
        provenance,
        draft: false,
      },
    ),
    flowTriggerEntityId
      ? HashLinkEntity.create<FlowRunTriggeredByLink["linkEntity"]>(
          graphApiClient,
          userAuthentication,
          {
            webId,
            entityTypeIds: [systemLinkEntityTypes.triggeredBy.linkEntityTypeId],
            properties: { value: {} },
            linkData: {
              leftEntityId: flowEntityId,
              rightEntityId: flowTriggerEntityId,
            },
            provenance,
            draft: false,
          },
        )
      : null,
  ]);

  return { flowEntityId };
};
