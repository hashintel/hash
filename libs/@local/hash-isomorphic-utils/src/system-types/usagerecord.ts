/**
 * This file was automatically generated – do not edit it.
 */

import type { Entity, LinkData } from "@blockprotocol/graph";

import type {
  AppliesFromPropertyValue,
  AppliesUntilPropertyValue,
  Created,
  CreatedOutgoingLinkAndTarget,
  CreatedOutgoingLinksByLinkEntityTypeId,
  CreatedProperties,
  DateTimeDataType,
  FeatureNamePropertyValue,
  InputUnitCostPropertyValue,
  Link,
  LinkOutgoingLinkAndTarget,
  LinkOutgoingLinksByLinkEntityTypeId,
  LinkProperties,
  NumberDataType,
  OutputUnitCostPropertyValue,
  ServiceFeature,
  ServiceFeatureOutgoingLinkAndTarget,
  ServiceFeatureOutgoingLinksByLinkEntityTypeId,
  ServiceFeatureProperties,
  ServiceNamePropertyValue,
  ServiceUnitCostPropertyValue,
  TextDataType,
} from "./shared";

export type {
  AppliesFromPropertyValue,
  AppliesUntilPropertyValue,
  Created,
  CreatedOutgoingLinkAndTarget,
  CreatedOutgoingLinksByLinkEntityTypeId,
  CreatedProperties,
  DateTimeDataType,
  FeatureNamePropertyValue,
  InputUnitCostPropertyValue,
  Link,
  LinkOutgoingLinkAndTarget,
  LinkOutgoingLinksByLinkEntityTypeId,
  LinkProperties,
  NumberDataType,
  OutputUnitCostPropertyValue,
  ServiceFeature,
  ServiceFeatureOutgoingLinkAndTarget,
  ServiceFeatureOutgoingLinksByLinkEntityTypeId,
  ServiceFeatureProperties,
  ServiceNamePropertyValue,
  ServiceUnitCostPropertyValue,
  TextDataType,
};

/**
 * How many input units were or will be used
 */
export type InputUnitCountPropertyValue = NumberDataType;

/**
 * How many output units were or will be used
 */
export type OutputUnitCountPropertyValue = NumberDataType;

export type RecordsUsageOf = Entity<RecordsUsageOfProperties> & {
  linkData: LinkData;
};

export type RecordsUsageOfOutgoingLinkAndTarget = never;

export type RecordsUsageOfOutgoingLinksByLinkEntityTypeId = {};

/**
 * The thing that something records usage of.
 */
export type RecordsUsageOfProperties = RecordsUsageOfProperties1 &
  RecordsUsageOfProperties2;
export type RecordsUsageOfProperties1 = LinkProperties;

export type RecordsUsageOfProperties2 = {};

export type Updated = Entity<UpdatedProperties> & { linkData: LinkData };

export type UpdatedOutgoingLinkAndTarget = never;

export type UpdatedOutgoingLinksByLinkEntityTypeId = {};

/**
 * The thing that something created.
 */
export type UpdatedProperties = UpdatedProperties1 & UpdatedProperties2;
export type UpdatedProperties1 = LinkProperties;

export type UpdatedProperties2 = {};

export type UsageRecord = Entity<UsageRecordProperties>;

export type UsageRecordCreatedLink = {
  linkEntity: Created;
  rightEntity: Entity;
};

export type UsageRecordOutgoingLinkAndTarget =
  | UsageRecordCreatedLink
  | UsageRecordRecordsUsageOfLink
  | UsageRecordUpdatedLink;

export type UsageRecordOutgoingLinksByLinkEntityTypeId = {
  "https://hash.ai/@hash/types/entity-type/created/v/1": UsageRecordCreatedLink;
  "https://hash.ai/@hash/types/entity-type/records-usage-of/v/1": UsageRecordRecordsUsageOfLink;
  "https://hash.ai/@hash/types/entity-type/updated/v/1": UsageRecordUpdatedLink;
};

/**
 * A record of usage of a service
 */
export type UsageRecordProperties = {
  "https://hash.ai/@hash/types/property-type/input-unit-count/"?: InputUnitCountPropertyValue;
  "https://hash.ai/@hash/types/property-type/output-unit-count/"?: OutputUnitCountPropertyValue;
};

export type UsageRecordRecordsUsageOfLink = {
  linkEntity: RecordsUsageOf;
  rightEntity: ServiceFeature;
};

export type UsageRecordUpdatedLink = {
  linkEntity: Updated;
  rightEntity: Entity;
};
