import { getHashInstanceAdminAccountGroupId } from "@local/hash-backend-utils/hash-instance";
import type { GraphApi } from "@local/hash-graph-client";
import { Entity } from "@local/hash-graph-sdk/entity";
import type { AccountId } from "@local/hash-graph-types/account";
import type { EntityUuid } from "@local/hash-graph-types/entity";
import type { BoundedTimeInterval } from "@local/hash-graph-types/temporal-versioning";
import type { OwnedById } from "@local/hash-graph-types/web";
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
import { getAggregateUsageRecords } from "@local/hash-isomorphic-utils/service-usage";
import {
  mapGraphApiEntityToEntity,
  mapGraphApiSubgraphToSubgraph,
} from "@local/hash-isomorphic-utils/subgraph-mapping";
import type { UsageRecordProperties } from "@local/hash-isomorphic-utils/system-types/usagerecord";
import type {
  EntityRelationAndSubject,
  EntityRootType,
} from "@local/hash-subgraph";
import { entityIdFromComponents } from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";

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
    userAccountId: AccountId;
    decisionTimeInterval?: BoundedTimeInterval;
    webId: OwnedById;
  },
): Promise<AggregatedUsageRecord[]> => {
  const serviceUsageRecordSubgraph = await context.graphApi
    .getEntitySubgraph(userAccountId, {
      filter: {
        all: [
          generateVersionedUrlMatchingFilter(
            systemEntityTypes.usageRecord.entityTypeId,
            { ignoreParents: true },
          ),
          {
            equal: [
              {
                path: ["ownedById"],
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
      return mapGraphApiSubgraphToSubgraph<EntityRootType>(
        data.subgraph,
        userAccountId,
      );
    });

  const serviceUsageRecords = getRoots(serviceUsageRecordSubgraph);

  const aggregateUsageRecords = getAggregateUsageRecords({
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
    serviceName,
    featureName,
    inputUnitCount,
    outputUnitCount,
    userAccountId,
  }: {
    assignUsageToWebId: OwnedById;
    serviceName: string;
    featureName: string;
    inputUnitCount?: number;
    outputUnitCount?: number;
    userAccountId: AccountId;
  },
) => {
  const properties: UsageRecordProperties = {
    "https://hash.ai/@hash/types/property-type/input-unit-count/":
      inputUnitCount,
    "https://hash.ai/@hash/types/property-type/output-unit-count/":
      outputUnitCount,
  };

  /**
   * We want to assign usage to the web, which may be an org, but be able to identify which users
   * incurred which usage in an org – so we create the usage record using the user that incurred it.
   * For manually-triggered flows, this is the user that triggered the flow.
   * For automatically triggered (scheduled, reactive), this is the user that created the trigger/schedule.
   */
  const authentication = { actorId: userAccountId };

  const hashInstanceAdminGroupId = await getHashInstanceAdminAccountGroupId(
    context,
    authentication,
  );

  const serviceFeatureEntities = await context.graphApi
    .getEntities(authentication.actorId, {
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

  const entityRelationships: EntityRelationAndSubject[] = [
    {
      relation: "administrator",
      subject: {
        kind: "accountGroup",
        subjectId: hashInstanceAdminGroupId,
        subjectSet: "member",
      },
    },
    {
      relation: "viewer",
      subject: {
        kind: "accountGroup",
        subjectId: assignUsageToWebId,
        subjectSet: "administrator",
      },
    },
  ];

  const usageRecordEntityUuid = generateUuid() as EntityUuid;

  const usageRecordEntityId = entityIdFromComponents(
    assignUsageToWebId,
    usageRecordEntityUuid,
  );

  const createdEntities = await Entity.createMultiple(
    context.graphApi,
    authentication,
    [
      {
        ownedById: assignUsageToWebId,
        draft: false,
        entityUuid: usageRecordEntityUuid,
        properties,
        entityTypeId: systemEntityTypes.usageRecord.entityTypeId,
        relationships: entityRelationships,
      },
      {
        ownedById: assignUsageToWebId,
        draft: false,
        properties: {},
        linkData: {
          leftEntityId: usageRecordEntityId,
          rightEntityId: serviceFeatureEntity.metadata.recordId.entityId,
        },
        entityTypeId: systemLinkEntityTypes.recordsUsageOf.linkEntityTypeId,
        relationships: entityRelationships,
      },
    ],
  );

  const usageRecordEntity = createdEntities.find(
    (entity) => entity.metadata.recordId.entityId === usageRecordEntityId,
  );

  if (!usageRecordEntity) {
    throw new Error(
      `Failed to create usage record entity for webId ${assignUsageToWebId}.`,
    );
  }

  return usageRecordEntity;
};
