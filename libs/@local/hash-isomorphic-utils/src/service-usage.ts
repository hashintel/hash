import type { Entity } from "@local/hash-graph-sdk/entity";
import type { BoundedTimeInterval } from "@local/hash-graph-types/temporal-versioning";
import type { EntityRootType, Subgraph } from "@local/hash-subgraph";
import { getOutgoingLinkAndTargetEntities } from "@local/hash-subgraph/stdlib";

import type { FlowUsageRecordCustomMetadata } from "./flows/types.js";
import { systemLinkEntityTypes } from "./ontology-type-ids.js";
import { simplifyProperties } from "./simplify-properties.js";
import type {
  ServiceFeature,
  UsageRecord,
} from "./system-types/usagerecord.js";

const generateAggregateUsageKey = ({
  serviceName,
  featureName,
}: {
  serviceName: string;
  featureName: string;
}) => `${serviceName}:${featureName}`;

const getServiceFeatureForUsage = ({
  serviceUsageRecordSubgraph,
  usageRecord,
}: {
  serviceUsageRecordSubgraph: Subgraph<EntityRootType>;
  usageRecord: Entity<UsageRecord>;
}) => {
  const linkedEntities = getOutgoingLinkAndTargetEntities(
    serviceUsageRecordSubgraph,
    usageRecord.metadata.recordId.entityId,
  );

  const serviceFeatureLinkAndEntities = linkedEntities.filter(
    ({ linkEntity }) =>
      linkEntity[0]!.metadata.entityTypeId ===
      systemLinkEntityTypes.recordsUsageOf.linkEntityTypeId,
  );

  if (serviceFeatureLinkAndEntities.length !== 1) {
    throw new Error(
      `Expected exactly one service feature link for service usage record ${usageRecord.metadata.recordId.entityId}, got ${serviceFeatureLinkAndEntities.length}.`,
    );
  }

  const serviceFeatureEntity = serviceFeatureLinkAndEntities[0]!
    .rightEntity[0]! as Entity<ServiceFeature>;

  const { featureName, serviceName, serviceUnitCost } = simplifyProperties(
    serviceFeatureEntity.properties,
  );

  if (!serviceUnitCost) {
    throw new Error("Cannot calculate usage cost without service unit cost.");
  }

  const applicablePrice = serviceUnitCost.find((entry) => {
    const { appliesUntil, appliesFrom } = simplifyProperties(entry);

    if (
      appliesUntil &&
      appliesUntil <= usageRecord.metadata.provenance.createdAtTransactionTime
    ) {
      return false;
    }
    if (!appliesFrom) {
      return false;
    }

    return (
      appliesFrom <= usageRecord.metadata.provenance.createdAtTransactionTime
    );
  });

  if (!applicablePrice) {
    const serviceFeatureKey = generateAggregateUsageKey({
      serviceName,
      featureName,
    });

    throw new Error(
      `No applicable price found for service feature ${serviceFeatureKey}.`,
    );
  }

  const { inputUnitCost, outputUnitCost } = simplifyProperties(applicablePrice);

  return { inputUnitCost, outputUnitCost, serviceName, featureName };
};

export interface AggregatedUsageRecord {
  serviceName: string;
  featureName: string;
  totalInputUnitCount: number;
  totalOutputUnitCount: number;
  totalCostInUsd: number;
  last24hoursTotalCostInUsd: number;
  limitedToPeriod: BoundedTimeInterval | null;
}

export const getAggregateUsageRecordsByServiceFeature = ({
  decisionTimeInterval,
  serviceUsageRecords,
  serviceUsageRecordSubgraph,
}: {
  decisionTimeInterval?: BoundedTimeInterval;
  serviceUsageRecords: Entity<UsageRecord>[];
  serviceUsageRecordSubgraph: Subgraph<EntityRootType>;
}): AggregatedUsageRecord[] => {
  const aggregateUsageByServiceFeature: Record<string, AggregatedUsageRecord> =
    {};

  for (const record of serviceUsageRecords) {
    const { inputUnitCost, outputUnitCost, serviceName, featureName } =
      getServiceFeatureForUsage({
        serviceUsageRecordSubgraph,
        usageRecord: record,
      });

    const { inputUnitCount, outputUnitCount } = simplifyProperties(
      record.properties,
    );

    const serviceFeatureKey = generateAggregateUsageKey({
      serviceName,
      featureName,
    });

    aggregateUsageByServiceFeature[serviceFeatureKey] ??= {
      serviceName,
      featureName,
      limitedToPeriod: decisionTimeInterval ?? null,
      totalInputUnitCount: 0,
      totalOutputUnitCount: 0,
      totalCostInUsd: 0,
      last24hoursTotalCostInUsd: 0,
    };
    const aggregateUsage = aggregateUsageByServiceFeature[serviceFeatureKey];

    aggregateUsage.totalInputUnitCount = aggregateUsage.totalInputUnitCount +
      (inputUnitCount && inputUnitCount >= 0 ? inputUnitCount : 0);
    aggregateUsage.totalOutputUnitCount = aggregateUsage.totalOutputUnitCount +
      (outputUnitCount && outputUnitCount >= 0 ? outputUnitCount : 0);

    const inputCost =
      (inputUnitCount ?? 0) *
      (inputUnitCost && inputUnitCost >= 0 ? inputUnitCost : 0);
    const outputCost =
      (outputUnitCount ?? 0) *
      (outputUnitCost && outputUnitCost >= 0 ? outputUnitCost : 0);
    const totalCost = inputCost + outputCost;

    aggregateUsage.totalCostInUsd = aggregateUsage.totalCostInUsd + totalCost;

    const oneDayEarlier = new Date(
      Date.now() - 24 * 60 * 60 * 1000,
    ).toISOString();

    if (record.metadata.provenance.createdAtTransactionTime > oneDayEarlier) {
      aggregateUsage.last24hoursTotalCostInUsd = aggregateUsage.last24hoursTotalCostInUsd + totalCost;
    }
  }

  return Object.values(aggregateUsageByServiceFeature);
};

export interface AggregatedUsageByTask {
  taskName: string;
  totalInputUnitCount: number;
  totalOutputUnitCount: number;
  totalCostInUsd: number;
}

export const getAggregateUsageRecordsByTask = ({
  serviceUsageRecords,
  serviceUsageRecordSubgraph,
}: {
  serviceUsageRecords: Entity<UsageRecord>[];
  serviceUsageRecordSubgraph: Subgraph<EntityRootType>;
}): AggregatedUsageByTask[] => {
  const aggregateUsageByTask: Record<string, AggregatedUsageByTask> = {};

  for (const record of serviceUsageRecords) {
    const { inputUnitCount, outputUnitCount, customMetadata } =
      simplifyProperties(record.properties);

    const taskName = (
      customMetadata as FlowUsageRecordCustomMetadata | undefined
    )?.taskName;

    if (!taskName) {
      continue;
    }

    const { inputUnitCost, outputUnitCost } = getServiceFeatureForUsage({
      serviceUsageRecordSubgraph,
      usageRecord: record,
    });

    aggregateUsageByTask[taskName] ??= {
      taskName,
      totalCostInUsd: 0,
      totalInputUnitCount: 0,
      totalOutputUnitCount: 0,
    };
    const aggregateUsage = aggregateUsageByTask[taskName];

    aggregateUsage.totalInputUnitCount = aggregateUsage.totalInputUnitCount +
      (inputUnitCount && inputUnitCount >= 0 ? inputUnitCount : 0);
    aggregateUsage.totalOutputUnitCount = aggregateUsage.totalOutputUnitCount +
      (outputUnitCount && outputUnitCount >= 0 ? outputUnitCount : 0);

    const inputCost =
      (inputUnitCount ?? 0) *
      (inputUnitCost && inputUnitCost >= 0 ? inputUnitCost : 0);
    const outputCost =
      (outputUnitCount ?? 0) *
      (outputUnitCost && outputUnitCost >= 0 ? outputUnitCost : 0);
    const totalCost = inputCost + outputCost;

    aggregateUsage.totalCostInUsd = aggregateUsage.totalCostInUsd + totalCost;
  }

  return Object.values(aggregateUsageByTask);
};
