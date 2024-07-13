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
} from "./shared";

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
export type Created = {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/created/v/1";
  properties: CreatedProperties;
  propertiesWithMetadata: CreatedPropertiesWithMetadata;
};

export type CreatedOutgoingLinkAndTarget = never;

export type CreatedOutgoingLinksByLinkEntityTypeId = {};

/**
 * The thing that something created.
 */
export type CreatedProperties = CreatedProperties1 & CreatedProperties2;
export type CreatedProperties1 = LinkProperties;

export type CreatedProperties2 = {};

export type CreatedPropertiesWithMetadata = {
  metadata?: ObjectMetadata;
  value: {};
};

/**
 * Additional information about something.
 */
export type CustomMetadataPropertyValue = ObjectDataType;

export type CustomMetadataPropertyValueWithMetadata =
  ObjectDataTypeWithMetadata;

/**
 * Something that was incurred in something else.
 */
export type IncurredIn = {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/incurred-in/v/1";
  properties: IncurredInProperties;
  propertiesWithMetadata: IncurredInPropertiesWithMetadata;
};

export type IncurredInOutgoingLinkAndTarget = never;

export type IncurredInOutgoingLinksByLinkEntityTypeId = {};

/**
 * Something that was incurred in something else.
 */
export type IncurredInProperties = IncurredInProperties1 &
  IncurredInProperties2;
export type IncurredInProperties1 = LinkProperties;

export type IncurredInProperties2 = {};

export type IncurredInPropertiesWithMetadata = {
  metadata?: ObjectMetadata;
  value: {};
};

/**
 * How many input units were or will be used
 */
export type InputUnitCountPropertyValue = NumberDataType;

export type InputUnitCountPropertyValueWithMetadata =
  NumberDataTypeWithMetadata;

/**
 * How many output units were or will be used
 */
export type OutputUnitCountPropertyValue = NumberDataType;

export type OutputUnitCountPropertyValueWithMetadata =
  NumberDataTypeWithMetadata;

/**
 * The thing that something records usage of.
 */
export type RecordsUsageOf = {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/records-usage-of/v/1";
  properties: RecordsUsageOfProperties;
  propertiesWithMetadata: RecordsUsageOfPropertiesWithMetadata;
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

export type RecordsUsageOfPropertiesWithMetadata = {
  metadata?: ObjectMetadata;
  value: {};
};

/**
 * The thing that something created.
 */
export type Updated = {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/updated/v/1";
  properties: UpdatedProperties;
  propertiesWithMetadata: UpdatedPropertiesWithMetadata;
};

export type UpdatedOutgoingLinkAndTarget = never;

export type UpdatedOutgoingLinksByLinkEntityTypeId = {};

/**
 * The thing that something created.
 */
export type UpdatedProperties = UpdatedProperties1 & UpdatedProperties2;
export type UpdatedProperties1 = LinkProperties;

export type UpdatedProperties2 = {};

export type UpdatedPropertiesWithMetadata = {
  metadata?: ObjectMetadata;
  value: {};
};

/**
 * A record of usage of a service
 */
export type UsageRecord = {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/usage-record/v/2";
  properties: UsageRecordProperties;
  propertiesWithMetadata: UsageRecordPropertiesWithMetadata;
};

export type UsageRecordCreatedLink = {
  linkEntity: Created;
  rightEntity: Entity;
};

export type UsageRecordIncurredInLink = {
  linkEntity: IncurredIn;
  rightEntity: FlowRun;
};

export type UsageRecordOutgoingLinkAndTarget =
  | UsageRecordCreatedLink
  | UsageRecordIncurredInLink
  | UsageRecordRecordsUsageOfLink
  | UsageRecordUpdatedLink;

export type UsageRecordOutgoingLinksByLinkEntityTypeId = {
  "https://hash.ai/@hash/types/entity-type/created/v/1": UsageRecordCreatedLink;
  "https://hash.ai/@hash/types/entity-type/incurred-in/v/1": UsageRecordIncurredInLink;
  "https://hash.ai/@hash/types/entity-type/records-usage-of/v/1": UsageRecordRecordsUsageOfLink;
  "https://hash.ai/@hash/types/entity-type/updated/v/1": UsageRecordUpdatedLink;
};

/**
 * A record of usage of a service
 */
export type UsageRecordProperties = {
  "https://hash.ai/@hash/types/property-type/custom-metadata/"?: CustomMetadataPropertyValue;
  "https://hash.ai/@hash/types/property-type/input-unit-count/"?: InputUnitCountPropertyValue;
  "https://hash.ai/@hash/types/property-type/output-unit-count/"?: OutputUnitCountPropertyValue;
};

export type UsageRecordPropertiesWithMetadata = {
  metadata?: ObjectMetadata;
  value: {
    "https://hash.ai/@hash/types/property-type/custom-metadata/"?: CustomMetadataPropertyValueWithMetadata;
    "https://hash.ai/@hash/types/property-type/input-unit-count/"?: InputUnitCountPropertyValueWithMetadata;
    "https://hash.ai/@hash/types/property-type/output-unit-count/"?: OutputUnitCountPropertyValueWithMetadata;
  };
};

export type UsageRecordRecordsUsageOfLink = {
  linkEntity: RecordsUsageOf;
  rightEntity: ServiceFeature;
};

export type UsageRecordUpdatedLink = {
  linkEntity: Updated;
  rightEntity: Entity;
};
