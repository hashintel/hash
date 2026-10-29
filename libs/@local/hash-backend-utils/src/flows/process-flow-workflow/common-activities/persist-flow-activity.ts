import { entityIdFromComponents } from "@blockprotocol/type-system";
import { typedEntries } from "@local/advanced-types/typed-entries";
import { HashEntity } from "@local/hash-graph-sdk/entity";
import {
  mapFlowRunToEntityProperties,
  mapOpenInputRequestsToEntityProperty,
} from "@local/hash-isomorphic-utils/flows/mappings";
import { generateUuid } from "@local/hash-isomorphic-utils/generate-uuid";
import { FlowRunStatus } from "@local/hash-isomorphic-utils/graphql/api-types.gen";
import {
  systemEntityTypes,
  systemLinkEntityTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";

import { getFlowRunEntityByWorkflowId } from "../../shared/get-flow-run-entity-by-workflow-id.js";
import { mapFlowRunStatusToEntityProperties } from "../../shared/save-flow-run-status.js";

import type {
  ActorEntityUuid,
  BaseUrl,
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
  /** When the run started. Only used, and required, when the run's entity is created. */
  startedAt?: string;
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
    startedAt,
    stepIds,
    userAuthentication,
    webId,
  } = params;

  const { temporalWorkflowId } = flow;

  const flowRunProperties = mapFlowRunToEntityProperties(flow);

  const existingFlowEntity = await getFlowRunEntityByWorkflowId({
    graphApiClient,
    temporalWorkflowId,
    userAuthentication,
  });

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

    /*
     * Each property the run's progress describes is set on its own, leaving the run's open input requests, which are
     * saved as they're raised and answered, as they are. Outputs a reset undid are removed.
     */
    const outputsKey = "https://hash.ai/@h/types/property-type/outputs/";

    await existingFlowEntity.patch(graphApiClient, userAuthentication, {
      propertyPatches: [
        ...typedEntries(flowRunProperties.value).map(([baseUrl, property]) => ({
          op: "add" as const,
          path: [baseUrl as BaseUrl],
          property,
        })),
        ...(!flowRunProperties.value[outputsKey] &&
        existingFlowEntity.properties[outputsKey] !== undefined
          ? [
              {
                op: "remove" as const,
                path: [systemPropertyTypes.outputs.propertyTypeBaseUrl],
              },
            ]
          : []),
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

  if (!flowDefinitionEntityId || !startedAt) {
    throw new Error(
      `The entity of run ${temporalWorkflowId} is created by the first persist, which must be given the Flow Definition entity it uses and when the run started`,
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
      properties: {
        ...flowRunProperties,
        value: {
          ...flowRunProperties.value,
          ...mapFlowRunStatusToEntityProperties({
            status: FlowRunStatus.Running,
            startedAt,
          }),
          "https://hash.ai/@h/types/property-type/open-input-request/":
            mapOpenInputRequestsToEntityProperty([]),
        },
      },
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
