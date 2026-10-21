import { getOutgoingLinkAndTargetEntities } from "@blockprotocol/graph/stdlib";

import { systemLinkEntityTypes } from "./ontology-type-ids.js";
import { simplifyProperties } from "./simplify-properties.js";

import type { FlowUsageRecordCustomMetadata } from "./flows/types.js";
import type {
  ServiceFeature,
  UsageRecord,
} from "./system-types/usagerecord.js";
import type { EntityRootType, Subgraph } from "@blockprotocol/graph";
import type {
  ClosedTemporalBound,
  TemporalInterval,
} from "@blockprotocol/type-system";
import type { HashEntity } from "@local/hash-graph-sdk/entity";

const generateAggregateUsageKey = ({
  serviceName,
  featureName,
}: {
  serviceName: string;
  featureName: string;
}): string => `${serviceName}:${featureName}`;

const hoursPerDay = 24;
const minutesPerHour = 60;
const secondsPerMinute = 60;
const millisecondsPerSecond = 1000;
const millisecondsPerDay =
  hoursPerDay * minutesPerHour * secondsPerMinute * millisecondsPerSecond;

const nonNegativeOrZero = (value: number | null | undefined): number =>
  value !== undefined && value !== null && value >= 0 ? value : 0;

const getServiceFeatureForUsage = ({
  serviceUsageRecordSubgraph,
  usageRecord,
}: {
  serviceUsageRecordSubgraph: Subgraph<EntityRootType>;
  usageRecord: HashEntity<UsageRecord>;
}): {
  inputUnitCost: number | undefined;
  outputUnitCost: number | undefined;
  serviceName: string;
  featureName: string;
} => {
  const linkedEntities = getOutgoingLinkAndTargetEntities(
    serviceUsageRecordSubgraph,
    usageRecord.metadata.recordId.entityId,
  );

  const serviceFeatureLinkAndEntities = linkedEntities.filter(
    ({ linkEntity }) =>
      linkEntity[0]?.metadata.entityTypeIds.includes(
        systemLinkEntityTypes.recordsUsageOf.linkEntityTypeId,
      ) ?? false,
  );
  const [serviceFeatureLinkAndEntity] = serviceFeatureLinkAndEntities;

  if (
    serviceFeatureLinkAndEntity === undefined ||
    serviceFeatureLinkAndEntities.length !== 1
  ) {
    throw new Error(
      `Expected exactly one service feature link for service usage record ${usageRecord.metadata.recordId.entityId}, got ${serviceFeatureLinkAndEntities.length}.`,
    );
  }

  // SAFETY: the link type recordsUsageOf targets service feature entities.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the subgraph is untyped; the link type guarantees the target is a ServiceFeature
  const serviceFeatureEntity = serviceFeatureLinkAndEntity.rightEntity?.[0] as
    | HashEntity<ServiceFeature>
    | undefined;

  if (serviceFeatureEntity === undefined) {
    throw new Error(
      `Service feature entity missing from subgraph for service usage record ${usageRecord.metadata.recordId.entityId}.`,
    );
  }

  const { featureName, serviceName, serviceUnitCost } = simplifyProperties(
    serviceFeatureEntity.properties,
  );
  if (serviceUnitCost === undefined) {
    throw new Error("Cannot calculate usage cost without service unit cost.");
  }

  const applicablePrice = serviceUnitCost.find((entry) => {
    const { appliesUntil, appliesFrom } = simplifyProperties(entry);
    if (
      appliesUntil !== undefined &&
      appliesUntil !== "" &&
      appliesUntil <= usageRecord.metadata.provenance.createdAtTransactionTime
    ) {
      return false;
    }
    if (appliesFrom === "") {
      return false;
    }
    return (
      appliesFrom <= usageRecord.metadata.provenance.createdAtTransactionTime
    );
  });

  if (applicablePrice === undefined) {
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
  limitedToPeriod: TemporalInterval<
    ClosedTemporalBound,
    ClosedTemporalBound
  > | null;
}

export const getAggregateUsageRecordsByServiceFeature = ({
  decisionTimeInterval,
  serviceUsageRecords,
  serviceUsageRecordSubgraph,
}: {
  decisionTimeInterval?: TemporalInterval<
    ClosedTemporalBound,
    ClosedTemporalBound
  >;
  serviceUsageRecords: HashEntity<UsageRecord>[];
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

    aggregateUsage.totalInputUnitCount += nonNegativeOrZero(inputUnitCount);
    aggregateUsage.totalOutputUnitCount += nonNegativeOrZero(outputUnitCount);

    const inputCost = (inputUnitCount ?? 0) * nonNegativeOrZero(inputUnitCost);
    const outputCost =
      (outputUnitCount ?? 0) * nonNegativeOrZero(outputUnitCost);
    const totalCost = inputCost + outputCost;

    aggregateUsage.totalCostInUsd += totalCost;

    const oneDayEarlier = new Date(
      Date.now() - millisecondsPerDay,
    ).toISOString();
    if (record.metadata.provenance.createdAtTransactionTime > oneDayEarlier) {
      aggregateUsage.last24hoursTotalCostInUsd += totalCost;
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
  serviceUsageRecords: HashEntity<UsageRecord>[];
  serviceUsageRecordSubgraph: Subgraph<EntityRootType>;
}): AggregatedUsageByTask[] => {
  const aggregateUsageByTask: Record<string, AggregatedUsageByTask> = {};

  for (const record of serviceUsageRecords) {
    const { inputUnitCount, outputUnitCount, customMetadata } =
      simplifyProperties(record.properties);

    // SAFETY: custom metadata on flow usage records follows FlowUsageRecordCustomMetadata.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- false positive
    const flowMetadata = customMetadata as
      | FlowUsageRecordCustomMetadata
      | undefined;
    const taskName = flowMetadata?.taskName;
    if (taskName !== undefined && taskName !== "") {
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

      aggregateUsage.totalInputUnitCount += nonNegativeOrZero(inputUnitCount);
      aggregateUsage.totalOutputUnitCount += nonNegativeOrZero(outputUnitCount);

      const inputCost =
        (inputUnitCount ?? 0) * nonNegativeOrZero(inputUnitCost);
      const outputCost =
        (outputUnitCount ?? 0) * nonNegativeOrZero(outputUnitCost);
      const totalCost = inputCost + outputCost;

      aggregateUsage.totalCostInUsd += totalCost;
    }
  }

  return Object.values(aggregateUsageByTask);
};
