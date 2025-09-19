import type { EntityRootType } from "@blockprotocol/graph";
import { getRoots } from "@blockprotocol/graph/stdlib";
import type {
  ActorEntityUuid,
  AiId,
  ClosedTemporalBound,
  EntityUuid,
  ProvidedEntityEditionProvenance,
  TemporalInterval,
  UserId,
  WebId,
} from "@blockprotocol/type-system";
import { entityIdFromComponents } from "@blockprotocol/type-system";
import type { GraphApi } from "@local/hash-graph-client";
import { HashEntity } from "@local/hash-graph-sdk/entity";
import {
  mapGraphApiEntityToEntity,
  mapGraphApiSubgraphToSubgraph,
} from "@local/hash-graph-sdk/subgraph";
import { generateUuid } from "@local/hash-isomorphic-utils/generate-uuid";
import {
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import {
  systemEntityTypes,
  systemLinkEntityTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import type { AggregatedUsageRecord } from "@local/hash-isomorphic-utils/service-usage";
import { getAggregateUsageRecordsByServiceFeature } from "@local/hash-isomorphic-utils/service-usage";
import type {
  RecordsUsageOf,
  UsageRecord,
} from "@local/hash-isomorphic-utils/system-types/usagerecord";
import { backOff } from "exponential-backoff";

import { getWebMachineId } from "./machine-actors.js";

/**
 * Retrieve a web's service usage
 */
export const getWebServiceUsage = async (
  context: { graphApi: GraphApi },
  {
    decisionTimeInterval,
    userAccountId,
    webId,
  }: {
    userAccountId: ActorEntityUuid;
    decisionTimeInterval?: TemporalInterval<
      ClosedTemporalBound,
      ClosedTemporalBound
    >;
    webId: WebId;
  },
): Promise<AggregatedUsageRecord[]> => {
  const webBotId = await getWebMachineId(
    context,
    {
      actorId: userAccountId,
    },
    { webId },
  );

  if (!webBotId) {
    throw new Error(`Web bot for web ${webId} not found`);
  }

  const serviceUsageRecordSubgraph = await backOff(
    () =>
      context.graphApi
        .queryEntitySubgraph(webBotId, {
          filter: {
            all: [
              generateVersionedUrlMatchingFilter(
                systemEntityTypes.usageRecord.entityTypeId,
                { ignoreParents: true },
              ),
              {
                equal: [
                  {
                    path: ["webId"],
                  },
                  { parameter: webId },
                ],
              },
            ],
          },
          graphResolveDepths: {
            ...zeroedGraphResolveDepths,
            // Depths required to retrieve the service the usage record relates to
            hasLeftEntity: { incoming: 1, outgoing: 0 },
            hasRightEntity: { incoming: 0, outgoing: 1 },
          },
          temporalAxes: decisionTimeInterval
            ? {
                pinned: {
                  axis: "transactionTime",
                  timestamp: null,
                },
                variable: {
                  axis: "decisionTime",
                  interval: decisionTimeInterval,
                },
              }
            : currentTimeInstantTemporalAxes,
          includeDrafts: false,
        })
        .then(({ data }) => {
          return mapGraphApiSubgraphToSubgraph<
            EntityRootType<HashEntity<UsageRecord>>
          >(data.subgraph, userAccountId);
        }),
    {
      numOfAttempts: 3,
      startingDelay: 500,
      timeMultiple: 2,
    },
  );

  const serviceUsageRecords = getRoots(serviceUsageRecordSubgraph);

  const aggregateUsageRecords = getAggregateUsageRecordsByServiceFeature({
    decisionTimeInterval,
    serviceUsageRecords,
    serviceUsageRecordSubgraph,
  });

  return aggregateUsageRecords;
};

export const createUsageRecord = async (
  context: { graphApi: GraphApi },
  {
    assignUsageToWebId,
    customMetadata,
    serviceName,
    featureName,
    inputUnitCount,
    outputUnitCount,
    userAccountId,
    aiAssistantAccountId,
  }: {
    /**
     * The web the usage will be assigned to (user or org)
     */
    assignUsageToWebId: WebId;
    /**
     * Additional arbitrary metadata to store on the usage record.
     */
    customMetadata?: Record<string, unknown> | null;
    serviceName: string;
    featureName: string;
    inputUnitCount?: number;
    outputUnitCount?: number;
    /**
     * The user that is incurring the usage (e.g. the user that triggered the flow)
     * Tracked separately from webId as usage may be attributed to an org, but we want to know which user incurred it.
     */
    userAccountId: UserId;
    aiAssistantAccountId: AiId;
  },
) => {
  const properties: UsageRecord["propertiesWithMetadata"] = {
    value: {
      ...(inputUnitCount !== undefined
        ? {
            "https://hash.ai/@h/types/property-type/input-unit-count/": {
              value: inputUnitCount,
              metadata: {
                dataTypeId:
                  "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
              },
            },
          }
        : {}),
      ...(outputUnitCount !== undefined
        ? {
            "https://hash.ai/@h/types/property-type/output-unit-count/": {
              value: outputUnitCount,
              metadata: {
                dataTypeId:
                  "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
              },
            },
          }
        : {}),
      ...(customMetadata !== undefined && customMetadata !== null
        ? {
            "https://hash.ai/@h/types/property-type/custom-metadata/": {
              value: customMetadata,
              metadata: {
                dataTypeId:
                  "https://blockprotocol.org/@blockprotocol/types/data-type/object/v/1",
              },
            },
          }
        : {}),
    },
  };

  /**
   * We want to assign usage to the web, which may be an org, but be able to identify which users
   * incurred which usage in an org – so we create the usage record using the user that incurred it.
   * For manually-triggered flows, this is the user that triggered the flow.
   * For automatically triggered (scheduled, reactive), this is the user that created the trigger/schedule.
   */
  const authentication = { actorId: userAccountId };

  const serviceFeatureEntities = await context.graphApi
    .queryEntities(authentication.actorId, {
      filter: {
        all: [
          generateVersionedUrlMatchingFilter(
            systemEntityTypes.serviceFeature.entityTypeId,
            { ignoreParents: true },
          ),
          {
            equal: [
              {
                path: [
                  "properties",
                  systemPropertyTypes.serviceName.propertyTypeBaseUrl,
                ],
              },
              { parameter: serviceName },
            ],
          },
          {
            equal: [
              {
                path: [
                  "properties",
                  systemPropertyTypes.featureName.propertyTypeBaseUrl,
                ],
              },
              { parameter: featureName },
            ],
          },
        ],
      },
      temporalAxes: currentTimeInstantTemporalAxes,
      includeDrafts: false,
    })
    .then(({ data: response }) =>
      response.entities.map((entity) =>
        mapGraphApiEntityToEntity(entity, authentication.actorId),
      ),
    );

  if (serviceFeatureEntities.length !== 1) {
    throw new Error(
      `Expected exactly one service feature for service ${serviceName} and feature ${featureName} – found ${serviceFeatureEntities.length}.`,
    );
  }
  const serviceFeatureEntity = serviceFeatureEntities[0]!;

  const usageRecordEntityUuid = generateUuid() as EntityUuid;
  const recordsUsageOfEntityUuid = generateUuid() as EntityUuid;

  const usageRecordEntityId = entityIdFromComponents(
    assignUsageToWebId,
    usageRecordEntityUuid,
  );

  const provenance: ProvidedEntityEditionProvenance = {
    actorType: "machine",
    origin: {
      type: "api",
    },
  };

  const [usageRecord] = await HashEntity.createMultiple<
    [UsageRecord, RecordsUsageOf]
  >(context.graphApi, authentication, [
    {
      webId: assignUsageToWebId,
      draft: false,
      entityUuid: usageRecordEntityUuid,
      properties,
      provenance,
      entityTypeIds: [systemEntityTypes.usageRecord.entityTypeId],
      policies: [
        {
          name: `usage-record-view-entity-${recordsUsageOfEntityUuid}`,
          principal: {
            type: "actor",
            actorType: "ai",
            id: aiAssistantAccountId,
          },
          effect: "permit",
          actions: ["viewEntity"],
        },
      ],
    },
    {
      webId: assignUsageToWebId,
      draft: false,
      entityUuid: recordsUsageOfEntityUuid,
      properties: { value: {} },
      provenance,
      linkData: {
        leftEntityId: usageRecordEntityId,
        rightEntityId: serviceFeatureEntity.metadata.recordId.entityId,
      },
      entityTypeIds: [systemLinkEntityTypes.recordsUsageOf.linkEntityTypeId],
      policies: [
        {
          name: `usage-record-view-entity-${recordsUsageOfEntityUuid}`,
          principal: {
            type: "actor",
            actorType: "ai",
            id: aiAssistantAccountId,
          },
          effect: "permit",
          actions: ["viewEntity"],
        },
      ],
    },
  ]);

  return usageRecord;
};
