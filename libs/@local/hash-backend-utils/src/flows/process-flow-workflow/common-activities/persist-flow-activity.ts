import { entityIdFromComponents } from "@blockprotocol/type-system";
import { HashEntity, queryEntities } from "@local/hash-graph-sdk/entity";
import { mapFlowRunToEntityProperties } from "@local/hash-isomorphic-utils/flows/mappings";
import { generateUuid } from "@local/hash-isomorphic-utils/generate-uuid";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";
import {
  systemEntityTypes,
  systemLinkEntityTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";

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
  /**
   * The `Flow Definition` entity the run executes, which the run's entity `Uses`. Only used, and required, when the
   * run's entity is created.
   */
  flowDefinitionEntityId?: EntityId;
  flowRunEntityUuid?: EntityUuid;
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
    flowDefinitionEntityId,
    flowRunEntityUuid,
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

  if (!flowDefinitionEntityId) {
    throw new Error(
      `The entity of run ${temporalWorkflowId} is created by the first persist, which must be given the Flow Definition entity it uses`,
    );
  }

  const entityUuid = flowRunEntityUuid ?? (generateUuid() as EntityUuid);
  const flowEntityId = entityIdFromComponents(webId, entityUuid);

  const linkFromRun = (rightEntityId: EntityId) => ({
    webId,
    properties: { value: {} },
    linkData: { leftEntityId: flowEntityId, rightEntityId },
    provenance,
    draft: false,
  });

  /*
   * The run and its links are created in one request, which the graph applies in one transaction, so a run is
   * never left without its link to the definition it ran.
   */
  await HashEntity.createMultiple<
    [
      FlowRun,
      FlowRunUsesLink["linkEntity"],
      ...FlowRunTriggeredByLink["linkEntity"][],
    ]
  >(graphApiClient, userAuthentication, [
    {
      entityUuid,
      webId,
      entityTypeIds: [systemEntityTypes.flowRun.entityTypeId],
      properties: flowRunProperties,
      provenance,
      draft: false,
    },
    {
      ...linkFromRun(flowDefinitionEntityId),
      entityTypeIds: [systemLinkEntityTypes.uses.linkEntityTypeId],
    },
    ...(flowTriggerEntityId
      ? [
          {
            ...linkFromRun(flowTriggerEntityId),
            entityTypeIds: [
              systemLinkEntityTypes.triggeredBy.linkEntityTypeId,
            ] as FlowRunTriggeredByLink["linkEntity"]["entityTypeIds"],
          },
        ]
      : []),
  ]);

  return { flowEntityId };
};
