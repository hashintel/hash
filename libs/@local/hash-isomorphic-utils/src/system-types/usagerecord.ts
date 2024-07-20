/**
 * This file was automatically generated – do not edit it.
 */

import type { ObjectMetadata } from "@local/hash-graph-client";
import type { Entity } from "@local/hash-graph-sdk/entity";

import type {
  AppliesFromPropertyValue,
  AppliesFromPropertyValueWithMetadata,
  AppliesUntilPropertyValue,
  AppliesUntilPropertyValueWithMetadata,
  DateTimeDataType,
  DateTimeDataTypeWithMetadata,
  FeatureNamePropertyValue,
  FeatureNamePropertyValueWithMetadata,
  FlowDefinitionIDPropertyValue,
  FlowDefinitionIDPropertyValueWithMetadata,
  FlowRun,
  FlowRunOutgoingLinkAndTarget,
  FlowRunOutgoingLinksByLinkEntityTypeId,
  FlowRunProperties,
  FlowRunPropertiesWithMetadata,
  InputUnitCostPropertyValue,
  InputUnitCostPropertyValueWithMetadata,
  Link,
  LinkOutgoingLinkAndTarget,
  LinkOutgoingLinksByLinkEntityTypeId,
  LinkProperties,
  LinkPropertiesWithMetadata,
  NamePropertyValue,
  NamePropertyValueWithMetadata,
  NumberDataType,
  NumberDataTypeWithMetadata,
  ObjectDataType,
  ObjectDataTypeWithMetadata,
  OutputsPropertyValue,
  OutputsPropertyValueWithMetadata,
  OutputUnitCostPropertyValue,
  OutputUnitCostPropertyValueWithMetadata,
  ServiceFeature,
  ServiceFeatureOutgoingLinkAndTarget,
  ServiceFeatureOutgoingLinksByLinkEntityTypeId,
  ServiceFeatureProperties,
  ServiceFeaturePropertiesWithMetadata,
  ServiceNamePropertyValue,
  ServiceNamePropertyValueWithMetadata,
  ServiceUnitCostPropertyValue,
  ServiceUnitCostPropertyValueWithMetadata,
  StepPropertyValue,
  StepPropertyValueWithMetadata,
  TextDataType,
  TextDataTypeWithMetadata,
  TriggerDefinitionIDPropertyValue,
  TriggerDefinitionIDPropertyValueWithMetadata,
  TriggerPropertyValue,
  TriggerPropertyValueWithMetadata,
} from "./shared.js";

export type {
  AppliesFromPropertyValue,
  AppliesFromPropertyValueWithMetadata,
  AppliesUntilPropertyValue,
  AppliesUntilPropertyValueWithMetadata,
  DateTimeDataType,
  DateTimeDataTypeWithMetadata,
  FeatureNamePropertyValue,
  FeatureNamePropertyValueWithMetadata,
  FlowDefinitionIDPropertyValue,
  FlowDefinitionIDPropertyValueWithMetadata,
  FlowRun,
  FlowRunOutgoingLinkAndTarget,
  FlowRunOutgoingLinksByLinkEntityTypeId,
  FlowRunProperties,
  FlowRunPropertiesWithMetadata,
  InputUnitCostPropertyValue,
  InputUnitCostPropertyValueWithMetadata,
  Link,
  LinkOutgoingLinkAndTarget,
  LinkOutgoingLinksByLinkEntityTypeId,
  LinkProperties,
  LinkPropertiesWithMetadata,
  NamePropertyValue,
  NamePropertyValueWithMetadata,
  NumberDataType,
  NumberDataTypeWithMetadata,
  ObjectDataType,
  ObjectDataTypeWithMetadata,
  OutputsPropertyValue,
  OutputsPropertyValueWithMetadata,
  OutputUnitCostPropertyValue,
  OutputUnitCostPropertyValueWithMetadata,
  ServiceFeature,
  ServiceFeatureOutgoingLinkAndTarget,
  ServiceFeatureOutgoingLinksByLinkEntityTypeId,
  ServiceFeatureProperties,
  ServiceFeaturePropertiesWithMetadata,
  ServiceNamePropertyValue,
  ServiceNamePropertyValueWithMetadata,
  ServiceUnitCostPropertyValue,
  ServiceUnitCostPropertyValueWithMetadata,
  StepPropertyValue,
  StepPropertyValueWithMetadata,
  TextDataType,
  TextDataTypeWithMetadata,
  TriggerDefinitionIDPropertyValue,
  TriggerDefinitionIDPropertyValueWithMetadata,
  TriggerPropertyValue,
  TriggerPropertyValueWithMetadata,
};

/**
 * The thing that something created.
 */
export interface Created {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/created/v/1";
  properties: CreatedProperties;
  propertiesWithMetadata: CreatedPropertiesWithMetadata;
}

export type CreatedOutgoingLinkAndTarget = never;

export interface CreatedOutgoingLinksByLinkEntityTypeId {}

/**
 * The thing that something created.
 */
export type CreatedProperties = CreatedProperties1 & CreatedProperties2;
export type CreatedProperties1 = LinkProperties;

export interface CreatedProperties2 {}

export type CreatedPropertiesWithMetadata = CreatedPropertiesWithMetadata1 &
  CreatedPropertiesWithMetadata2;
export type CreatedPropertiesWithMetadata1 = LinkPropertiesWithMetadata;

export interface CreatedPropertiesWithMetadata2 {
  metadata?: ObjectMetadata;
  value: {};
}

/**
 * Additional information about something.
 */
export type CustomMetadataPropertyValue = ObjectDataType;

export type CustomMetadataPropertyValueWithMetadata =
  ObjectDataTypeWithMetadata;

/**
 * Something that was incurred in something else.
 */
export interface IncurredIn {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/incurred-in/v/1";
  properties: IncurredInProperties;
  propertiesWithMetadata: IncurredInPropertiesWithMetadata;
}

export type IncurredInOutgoingLinkAndTarget = never;

export interface IncurredInOutgoingLinksByLinkEntityTypeId {}

/**
 * Something that was incurred in something else.
 */
export type IncurredInProperties = IncurredInProperties1 &
  IncurredInProperties2;
export type IncurredInProperties1 = LinkProperties;

export interface IncurredInProperties2 {}

export type IncurredInPropertiesWithMetadata =
  IncurredInPropertiesWithMetadata1 & IncurredInPropertiesWithMetadata2;
export type IncurredInPropertiesWithMetadata1 = LinkPropertiesWithMetadata;

export interface IncurredInPropertiesWithMetadata2 {
  metadata?: ObjectMetadata;
  value: {};
}

/**
 * How many input units were or will be used.
 */
export type InputUnitCountPropertyValue = NumberDataType;

export type InputUnitCountPropertyValueWithMetadata =
  NumberDataTypeWithMetadata;

/**
 * How many output units were or will be used.
 */
export type OutputUnitCountPropertyValue = NumberDataType;

export type OutputUnitCountPropertyValueWithMetadata =
  NumberDataTypeWithMetadata;

/**
 * The thing that something records usage of.
 */
export interface RecordsUsageOf {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/records-usage-of/v/1";
  properties: RecordsUsageOfProperties;
  propertiesWithMetadata: RecordsUsageOfPropertiesWithMetadata;
}

export type RecordsUsageOfOutgoingLinkAndTarget = never;

export interface RecordsUsageOfOutgoingLinksByLinkEntityTypeId {}

/**
 * The thing that something records usage of.
 */
export type RecordsUsageOfProperties = RecordsUsageOfProperties1 &
  RecordsUsageOfProperties2;
export type RecordsUsageOfProperties1 = LinkProperties;

export interface RecordsUsageOfProperties2 {}

export type RecordsUsageOfPropertiesWithMetadata =
  RecordsUsageOfPropertiesWithMetadata1 & RecordsUsageOfPropertiesWithMetadata2;
export type RecordsUsageOfPropertiesWithMetadata1 = LinkPropertiesWithMetadata;

export interface RecordsUsageOfPropertiesWithMetadata2 {
  metadata?: ObjectMetadata;
  value: {};
}

/**
 * The thing that something created.
 */
export interface Updated {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/updated/v/1";
  properties: UpdatedProperties;
  propertiesWithMetadata: UpdatedPropertiesWithMetadata;
}

export type UpdatedOutgoingLinkAndTarget = never;

export interface UpdatedOutgoingLinksByLinkEntityTypeId {}

/**
 * The thing that something created.
 */
export type UpdatedProperties = UpdatedProperties1 & UpdatedProperties2;
export type UpdatedProperties1 = LinkProperties;

export interface UpdatedProperties2 {}

export type UpdatedPropertiesWithMetadata = UpdatedPropertiesWithMetadata1 &
  UpdatedPropertiesWithMetadata2;
export type UpdatedPropertiesWithMetadata1 = LinkPropertiesWithMetadata;

export interface UpdatedPropertiesWithMetadata2 {
  metadata?: ObjectMetadata;
  value: {};
}

/**
 * A record of usage of a service.
 */
export interface UsageRecord {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/usage-record/v/2";
  properties: UsageRecordProperties;
  propertiesWithMetadata: UsageRecordPropertiesWithMetadata;
}

export interface UsageRecordCreatedLink {
  linkEntity: Created;
  rightEntity: Entity;
}

export interface UsageRecordIncurredInLink {
  linkEntity: IncurredIn;
  rightEntity: FlowRun;
}

export type UsageRecordOutgoingLinkAndTarget =
  | UsageRecordCreatedLink
  | UsageRecordIncurredInLink
  | UsageRecordRecordsUsageOfLink
  | UsageRecordUpdatedLink;

export interface UsageRecordOutgoingLinksByLinkEntityTypeId {
  "https://hash.ai/@hash/types/entity-type/created/v/1": UsageRecordCreatedLink;
  "https://hash.ai/@hash/types/entity-type/incurred-in/v/1": UsageRecordIncurredInLink;
  "https://hash.ai/@hash/types/entity-type/records-usage-of/v/1": UsageRecordRecordsUsageOfLink;
  "https://hash.ai/@hash/types/entity-type/updated/v/1": UsageRecordUpdatedLink;
}

/**
 * A record of usage of a service.
 */
export interface UsageRecordProperties {
  "https://hash.ai/@hash/types/property-type/custom-metadata/"?: CustomMetadataPropertyValue;
  "https://hash.ai/@hash/types/property-type/input-unit-count/"?: InputUnitCountPropertyValue;
  "https://hash.ai/@hash/types/property-type/output-unit-count/"?: OutputUnitCountPropertyValue;
}

export interface UsageRecordPropertiesWithMetadata {
  metadata?: ObjectMetadata;
  value: {
    "https://hash.ai/@hash/types/property-type/custom-metadata/"?: CustomMetadataPropertyValueWithMetadata;
    "https://hash.ai/@hash/types/property-type/input-unit-count/"?: InputUnitCountPropertyValueWithMetadata;
    "https://hash.ai/@hash/types/property-type/output-unit-count/"?: OutputUnitCountPropertyValueWithMetadata;
  };
}

export interface UsageRecordRecordsUsageOfLink {
  linkEntity: RecordsUsageOf;
  rightEntity: ServiceFeature;
}

export interface UsageRecordUpdatedLink {
  linkEntity: Updated;
  rightEntity: Entity;
}
