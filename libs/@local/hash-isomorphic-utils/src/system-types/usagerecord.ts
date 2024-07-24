/**
 * This file was automatically generated – do not edit it.
 */

import type { ObjectMetadata } from "@local/hash-graph-client";
import type { Entity } from "@local/hash-graph-sdk/entity";
import type {
  EntityProperties,
  PropertyObject,
  PropertyObjectValueMetadata,
} from "@local/hash-graph-types/entity";

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
  FlowRunPropertiesWithMetadataValue,
  InputUnitCostPropertyValue,
  InputUnitCostPropertyValueWithMetadata,
  Link,
  LinkOutgoingLinkAndTarget,
  LinkOutgoingLinksByLinkEntityTypeId,
  LinkProperties,
  LinkPropertiesWithMetadata,
  LinkPropertiesWithMetadataValue,
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
  ServiceFeaturePropertiesWithMetadataValue,
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
  FlowRunPropertiesWithMetadataValue,
  InputUnitCostPropertyValue,
  InputUnitCostPropertyValueWithMetadata,
  Link,
  LinkOutgoingLinkAndTarget,
  LinkOutgoingLinksByLinkEntityTypeId,
  LinkProperties,
  LinkPropertiesWithMetadata,
  LinkPropertiesWithMetadataValue,
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
  ServiceFeaturePropertiesWithMetadataValue,
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
export interface Created extends EntityProperties {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/created/v/1";
  properties: CreatedProperties;
  propertiesWithMetadata: CreatedPropertiesWithMetadata;
}

export type CreatedOutgoingLinkAndTarget = never;

export interface CreatedOutgoingLinksByLinkEntityTypeId {}

/**
 * The thing that something created.
 */
export interface CreatedProperties
  extends CreatedProperties1,
    CreatedProperties2 {}
export interface CreatedProperties1 extends LinkProperties {}

export interface CreatedProperties2 {}

export interface CreatedPropertiesWithMetadata {
  metadata?: ObjectMetadata;
  value: CreatedPropertiesWithMetadataValue;
}

export interface CreatedPropertiesWithMetadataValue
  extends CreatedPropertiesWithMetadataValue1,
    CreatedPropertiesWithMetadataValue2 {}
export interface CreatedPropertiesWithMetadataValue1
  extends LinkPropertiesWithMetadataValue {}

export interface CreatedPropertiesWithMetadataValue2 {}

/**
 * Additional information about something.
 */
export type CustomMetadataPropertyValue = ObjectDataType;

export interface CustomMetadataPropertyValueWithMetadata
  extends ObjectDataTypeWithMetadata {}

/**
 * Something that was incurred in something else.
 */
export interface IncurredIn extends EntityProperties {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/incurred-in/v/1";
  properties: IncurredInProperties;
  propertiesWithMetadata: IncurredInPropertiesWithMetadata;
}

export type IncurredInOutgoingLinkAndTarget = never;

export interface IncurredInOutgoingLinksByLinkEntityTypeId {}

/**
 * Something that was incurred in something else.
 */
export interface IncurredInProperties
  extends IncurredInProperties1,
    IncurredInProperties2 {}
export interface IncurredInProperties1 extends LinkProperties {}

export interface IncurredInProperties2 {}

export interface IncurredInPropertiesWithMetadata {
  metadata?: ObjectMetadata;
  value: IncurredInPropertiesWithMetadataValue;
}

export interface IncurredInPropertiesWithMetadataValue
  extends IncurredInPropertiesWithMetadataValue1,
    IncurredInPropertiesWithMetadataValue2 {}
export interface IncurredInPropertiesWithMetadataValue1
  extends LinkPropertiesWithMetadataValue {}

export interface IncurredInPropertiesWithMetadataValue2 {}

/**
 * How many input units were or will be used
 */
export type InputUnitCountPropertyValue = NumberDataType;

export interface InputUnitCountPropertyValueWithMetadata
  extends NumberDataTypeWithMetadata {}

/**
 * How many output units were or will be used
 */
export type OutputUnitCountPropertyValue = NumberDataType;

export interface OutputUnitCountPropertyValueWithMetadata
  extends NumberDataTypeWithMetadata {}

/**
 * The thing that something records usage of.
 */
export interface RecordsUsageOf extends EntityProperties {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/records-usage-of/v/1";
  properties: RecordsUsageOfProperties;
  propertiesWithMetadata: RecordsUsageOfPropertiesWithMetadata;
}

export type RecordsUsageOfOutgoingLinkAndTarget = never;

export interface RecordsUsageOfOutgoingLinksByLinkEntityTypeId {}

/**
 * The thing that something records usage of.
 */
export interface RecordsUsageOfProperties
  extends RecordsUsageOfProperties1,
    RecordsUsageOfProperties2 {}
export interface RecordsUsageOfProperties1 extends LinkProperties {}

export interface RecordsUsageOfProperties2 {}

export interface RecordsUsageOfPropertiesWithMetadata {
  metadata?: ObjectMetadata;
  value: RecordsUsageOfPropertiesWithMetadataValue;
}

export interface RecordsUsageOfPropertiesWithMetadataValue
  extends RecordsUsageOfPropertiesWithMetadataValue1,
    RecordsUsageOfPropertiesWithMetadataValue2 {}
export interface RecordsUsageOfPropertiesWithMetadataValue1
  extends LinkPropertiesWithMetadataValue {}

export interface RecordsUsageOfPropertiesWithMetadataValue2 {}

/**
 * The thing that something created.
 */
export interface Updated extends EntityProperties {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/updated/v/1";
  properties: UpdatedProperties;
  propertiesWithMetadata: UpdatedPropertiesWithMetadata;
}

export type UpdatedOutgoingLinkAndTarget = never;

export interface UpdatedOutgoingLinksByLinkEntityTypeId {}

/**
 * The thing that something created.
 */
export interface UpdatedProperties
  extends UpdatedProperties1,
    UpdatedProperties2 {}
export interface UpdatedProperties1 extends LinkProperties {}

export interface UpdatedProperties2 {}

export interface UpdatedPropertiesWithMetadata {
  metadata?: ObjectMetadata;
  value: UpdatedPropertiesWithMetadataValue;
}

export interface UpdatedPropertiesWithMetadataValue
  extends UpdatedPropertiesWithMetadataValue1,
    UpdatedPropertiesWithMetadataValue2 {}
export interface UpdatedPropertiesWithMetadataValue1
  extends LinkPropertiesWithMetadataValue {}

export interface UpdatedPropertiesWithMetadataValue2 {}

/**
 * A record of usage of a service
 */
export interface UsageRecord extends EntityProperties {
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
 * A record of usage of a service
 */
export interface UsageRecordProperties extends PropertyObject {
  "https://hash.ai/@hash/types/property-type/custom-metadata/"?: CustomMetadataPropertyValue;
  "https://hash.ai/@hash/types/property-type/input-unit-count/"?: InputUnitCountPropertyValue;
  "https://hash.ai/@hash/types/property-type/output-unit-count/"?: OutputUnitCountPropertyValue;
}

export interface UsageRecordPropertiesWithMetadata {
  metadata?: ObjectMetadata;
  value: UsageRecordPropertiesWithMetadataValue;
}

export interface UsageRecordPropertiesWithMetadataValue
  extends PropertyObjectValueMetadata {
  "https://hash.ai/@hash/types/property-type/custom-metadata/"?: CustomMetadataPropertyValueWithMetadata;
  "https://hash.ai/@hash/types/property-type/input-unit-count/"?: InputUnitCountPropertyValueWithMetadata;
  "https://hash.ai/@hash/types/property-type/output-unit-count/"?: OutputUnitCountPropertyValueWithMetadata;
}

export interface UsageRecordRecordsUsageOfLink {
  linkEntity: RecordsUsageOf;
  rightEntity: ServiceFeature;
}

export interface UsageRecordUpdatedLink {
  linkEntity: Updated;
  rightEntity: Entity;
}
