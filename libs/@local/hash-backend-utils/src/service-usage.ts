import { getHashInstanceAdminAccountGroupId } from "@local/hash-backend-utils/hash-instance";
import { GraphApi } from "@local/hash-graph-client";
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
import { AggregatedUsageRecord } from "@local/hash-isomorphic-utils/service-usage";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import { ServiceFeatureProperties } from "@local/hash-isomorphic-utils/system-types/shared";
import { UsageRecordProperties } from "@local/hash-isomorphic-utils/system-types/usagerecord";
import {
  AccountId,
  BoundedTimeInterval,
  Entity,
  EntityRelationAndSubject,
  EntityRootType,
} from "@local/hash-subgraph";
import {
  getOutgoingLinkAndTargetEntities,
  getRoots,
  mapGraphApiSubgraphToSubgraph,
} from "@local/hash-subgraph/stdlib";

const generateAggregateUsageKey = ({
  serviceName,
  featureName,
}: {
  serviceName: string;
  featureName: string;
}) => `${serviceName}:${featureName}`;

/**
 * Retrieve a user's service usage
 */
export const getUserServiceUsage = async (
  context: { graphApi: GraphApi },
  authentication: { actorId: AccountId },
  {
    userAccountId,
    decisionTimeInterval,
  }: { userAccountId: AccountId; decisionTimeInterval?: BoundedTimeInterval },
): Promise<AggregatedUsageRecord[]> => {
  const serviceUsageRecordSubgraph = await context.graphApi
    .getEntitiesByQuery(authentication.actorId, {
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
              { parameter: userAccountId },
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
      return mapGraphApiSubgraphToSubgraph<EntityRootType>(data);
    });

  const serviceUsageRecords = getRoots(serviceUsageRecordSubgraph);

  const aggregateUsageByServiceFeature: Record<string, AggregatedUsageRecord> =
    {};

  for (const record of serviceUsageRecords) {
    const linkedEntities = getOutgoingLinkAndTargetEntities(
      serviceUsageRecordSubgraph,
      record.metadata.recordId.entityId,
    );

    const serviceFeatureLinkAndEntities = linkedEntities.filter(
      ({ linkEntity }) =>
        linkEntity[0]!.metadata.entityTypeId ===
        systemLinkEntityTypes.recordsUsageOf.linkEntityTypeId,
    );
    if (serviceFeatureLinkAndEntities.length !== 1) {
      throw new Error(
        `Expected exactly one service feature link for service usage record ${record.metadata.recordId.entityId}, got ${serviceFeatureLinkAndEntities.length}.`,
      );
    }

    console.log(JSON.stringify(serviceFeatureLinkAndEntities, undefined, 2));

    const serviceFeatureEntity = serviceFeatureLinkAndEntities[0]!
      .rightEntity[0]! as Entity<ServiceFeatureProperties>;

    const { featureName, serviceName, serviceUnitCost } = simplifyProperties(
      serviceFeatureEntity.properties,
    );
    if (!serviceUnitCost) {
      throw new Error("Cannot calculate usage cost without service unit cost.");
    }

    const serviceFeatureKey = generateAggregateUsageKey({
      serviceName,
      featureName,
    });

    const { inputUnitCount, outputUnitCount } = simplifyProperties(
      record.properties as UsageRecordProperties,
    );

    aggregateUsageByServiceFeature[serviceFeatureKey] ??= {
      serviceName,
      featureName,
      limitedToPeriod: decisionTimeInterval ?? null,
      totalInputUnitCount: 0,
      totalOutputUnitCount: 0,
      totalCostInUsd: 0,
      last24hoursTotalCostInUsd: 0,
    };
    const aggregateUsage = aggregateUsageByServiceFeature[serviceFeatureKey]!;

    aggregateUsage.totalInputUnitCount +=
      inputUnitCount && inputUnitCount >= 0 ? inputUnitCount : 0;
    aggregateUsage.totalOutputUnitCount +=
      outputUnitCount && outputUnitCount >= 0 ? outputUnitCount : 0;

    const applicablePrice = serviceUnitCost.find((entry) => {
      const { appliesUntil, appliesFrom } = simplifyProperties(entry);
      if (
        appliesUntil &&
        appliesUntil <= record.metadata.provenance.createdAtTransactionTime
      ) {
        return false;
      }
      if (!appliesFrom) {
        return false;
      }
      return appliesFrom >= record.metadata.provenance.createdAtTransactionTime;
    });

    if (!applicablePrice) {
      throw new Error(
        `No applicable price found for service feature ${serviceFeatureKey}.`,
      );
    }

    const { inputUnitCost, outputUnitCost } =
      simplifyProperties(applicablePrice);

    const inputCost =
      (inputUnitCount ?? 0) *
      (inputUnitCost && inputUnitCost >= 0 ? inputUnitCost : 0);
    const outputCost =
      (outputUnitCount ?? 0) *
      (outputUnitCost && outputUnitCost >= 0 ? outputUnitCost : 0);
    const totalCost = inputCost + outputCost;

    aggregateUsage.totalCostInUsd += totalCost;

    const oneDayEarlier = new Date(
      new Date().valueOf() - 24 * 60 * 60 * 1000,
    ).toISOString();
    if (record.metadata.provenance.createdAtTransactionTime > oneDayEarlier) {
      aggregateUsage.last24hoursTotalCostInUsd += totalCost;
    }
  }

  return Object.values(aggregateUsageByServiceFeature);
};

export const createUsageRecord = async (
  context: { graphApi: GraphApi },
  authentication: { actorId: AccountId },
  {
    userAccountId,
    serviceName,
    featureName,
    inputUnitCount,
    outputUnitCount,
  }: {
    userAccountId: AccountId;
    serviceName: string;
    featureName: string;
    inputUnitCount?: number;
    outputUnitCount?: number;
  },
) => {
  const properties: UsageRecordProperties = {
    "https://hash.ai/@hash/types/property-type/input-unit-count/":
      inputUnitCount,
    "https://hash.ai/@hash/types/property-type/output-unit-count/":
      outputUnitCount,
  };

  const hashInstanceAdminGroupId = await getHashInstanceAdminAccountGroupId(
    context,
    authentication,
  );

  const serviceFeatureEntities = await context.graphApi
    .getEntitiesByQuery(authentication.actorId, {
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
      graphResolveDepths: zeroedGraphResolveDepths,
      temporalAxes: currentTimeInstantTemporalAxes,
      includeDrafts: false,
    })
    .then((data) => {
      const subgraph = mapGraphApiSubgraphToSubgraph<EntityRootType>(data.data);

      return getRoots(subgraph);
    });

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
        kind: "account",
        subjectId: authentication.actorId,
      },
    },
    {
      relation: "viewer",
      subject: { kind: "account", subjectId: userAccountId },
    },
    {
      relation: "viewer",
      subject: {
        kind: "accountGroup",
        subjectId: hashInstanceAdminGroupId,
      },
    },
  ];

  const usageRecordEntityMetadata = await context.graphApi
    .createEntity(authentication.actorId, {
      draft: false,
      ownedById: userAccountId,
      properties,
      entityTypeId: systemEntityTypes.usageRecord.entityTypeId,
      relationships: entityRelationships,
    })
    .then(({ data }) => data);

  await context.graphApi.createEntity(authentication.actorId, {
    draft: false,
    ownedById: userAccountId,
    properties: {},
    linkData: {
      leftEntityId: usageRecordEntityMetadata.recordId.entityId,
      rightEntityId: serviceFeatureEntity.metadata.recordId.entityId,
    },
    entityTypeId: systemLinkEntityTypes.recordsUsageOf.linkEntityTypeId,
    relationships: entityRelationships,
  });

  return usageRecordEntityMetadata;
};
