/**
 * This file was automatically generated – do not edit it.
 */

import type {
  AppliesFromPropertyValue,
  AppliesFromPropertyValueWithMetadata,
  AppliesUntilPropertyValue,
  AppliesUntilPropertyValueWithMetadata,
  ClosedAtPropertyValue,
  ClosedAtPropertyValueWithMetadata,
  DateTimeDataType,
  DateTimeDataTypeWithMetadata,
  DescriptionPropertyValue,
  DescriptionPropertyValueWithMetadata,
  FeatureNamePropertyValue,
  FeatureNamePropertyValueWithMetadata,
  FlowDefinition,
  FlowDefinitionOutgoingLinkAndTarget,
  FlowDefinitionOutgoingLinksByLinkEntityTypeId,
  FlowDefinitionProperties,
  FlowDefinitionPropertiesWithMetadata,
  FlowRun,
  FlowRunOutgoingLinkAndTarget,
  FlowRunOutgoingLinksByLinkEntityTypeId,
  FlowRunProperties,
  FlowRunPropertiesWithMetadata,
  FlowRunTriggeredByLink,
  FlowRunUsesLink,
  FlowTrigger,
  FlowTriggerOutgoingLinkAndTarget,
  FlowTriggerOutgoingLinksByLinkEntityTypeId,
  FlowTriggerProperties,
  FlowTriggerPropertiesWithMetadata,
  FlowTriggerUsesLink,
  InputDefinitionPropertyValue,
  InputDefinitionPropertyValueWithMetadata,
  InputUnitCostPropertyValue,
  InputUnitCostPropertyValueWithMetadata,
  InputsPropertyValue,
  InputsPropertyValueWithMetadata,
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
  OpenInputRequestPropertyValue,
  OpenInputRequestPropertyValueWithMetadata,
  OutputDefinitionPropertyValue,
  OutputDefinitionPropertyValueWithMetadata,
  OutputUnitCostPropertyValue,
  OutputUnitCostPropertyValueWithMetadata,
  OutputsPropertyValue,
  OutputsPropertyValueWithMetadata,
  ServiceFeature,
  ServiceFeatureOutgoingLinkAndTarget,
  ServiceFeatureOutgoingLinksByLinkEntityTypeId,
  ServiceFeatureProperties,
  ServiceFeaturePropertiesWithMetadata,
  ServiceNamePropertyValue,
  ServiceNamePropertyValueWithMetadata,
  ServiceUnitCostPropertyValue,
  ServiceUnitCostPropertyValueWithMetadata,
  StartedAtPropertyValue,
  StartedAtPropertyValueWithMetadata,
  StatusPropertyValue,
  StatusPropertyValueWithMetadata,
  StepDefinitionPropertyValue,
  StepDefinitionPropertyValueWithMetadata,
  TextDataType,
  TextDataTypeWithMetadata,
  TriggeredBy,
  TriggeredByOutgoingLinkAndTarget,
  TriggeredByOutgoingLinksByLinkEntityTypeId,
  TriggeredByProperties,
  TriggeredByPropertiesWithMetadata,
  Uses,
  UsesOutgoingLinkAndTarget,
  UsesOutgoingLinksByLinkEntityTypeId,
  UsesProperties,
  UsesPropertiesWithMetadata,
  ValueDataType,
  ValueDataTypeWithMetadata,
  WorkflowIDPropertyValue,
  WorkflowIDPropertyValueWithMetadata,
} from "./shared.js";
import type { Entity, ObjectMetadata } from "@blockprotocol/type-system";

export type {
  AppliesFromPropertyValue,
  AppliesFromPropertyValueWithMetadata,
  AppliesUntilPropertyValue,
  AppliesUntilPropertyValueWithMetadata,
  ClosedAtPropertyValue,
  ClosedAtPropertyValueWithMetadata,
  DateTimeDataType,
  DateTimeDataTypeWithMetadata,
  DescriptionPropertyValue,
  DescriptionPropertyValueWithMetadata,
  FeatureNamePropertyValue,
  FeatureNamePropertyValueWithMetadata,
  FlowDefinition,
  FlowDefinitionOutgoingLinkAndTarget,
  FlowDefinitionOutgoingLinksByLinkEntityTypeId,
  FlowDefinitionProperties,
  FlowDefinitionPropertiesWithMetadata,
  FlowRun,
  FlowRunOutgoingLinkAndTarget,
  FlowRunOutgoingLinksByLinkEntityTypeId,
  FlowRunProperties,
  FlowRunPropertiesWithMetadata,
  FlowRunTriggeredByLink,
  FlowRunUsesLink,
  FlowTrigger,
  FlowTriggerOutgoingLinkAndTarget,
  FlowTriggerOutgoingLinksByLinkEntityTypeId,
  FlowTriggerProperties,
  FlowTriggerPropertiesWithMetadata,
  FlowTriggerUsesLink,
  InputDefinitionPropertyValue,
  InputDefinitionPropertyValueWithMetadata,
  InputsPropertyValue,
  InputsPropertyValueWithMetadata,
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
  OpenInputRequestPropertyValue,
  OpenInputRequestPropertyValueWithMetadata,
  OutputDefinitionPropertyValue,
  OutputDefinitionPropertyValueWithMetadata,
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
  StartedAtPropertyValue,
  StartedAtPropertyValueWithMetadata,
  StatusPropertyValue,
  StatusPropertyValueWithMetadata,
  StepDefinitionPropertyValue,
  StepDefinitionPropertyValueWithMetadata,
  TextDataType,
  TextDataTypeWithMetadata,
  TriggeredBy,
  TriggeredByOutgoingLinkAndTarget,
  TriggeredByOutgoingLinksByLinkEntityTypeId,
  TriggeredByProperties,
  TriggeredByPropertiesWithMetadata,
  Uses,
  UsesOutgoingLinkAndTarget,
  UsesOutgoingLinksByLinkEntityTypeId,
  UsesProperties,
  UsesPropertiesWithMetadata,
  ValueDataType,
  ValueDataTypeWithMetadata,
  WorkflowIDPropertyValue,
  WorkflowIDPropertyValueWithMetadata,
};

/**
 * The thing that something created.
 */
export type Created = {
  entityTypeIds: ["https://hash.ai/@h/types/entity-type/created/v/1"];
  properties: CreatedProperties;
  propertiesWithMetadata: CreatedPropertiesWithMetadata;
};

export type CreatedOutgoingLinkAndTarget = never;

export type CreatedOutgoingLinksByLinkEntityTypeId = {};

/**
 * The thing that something created.
 */
export type CreatedProperties = LinkProperties & {};

export type CreatedPropertiesWithMetadata = LinkPropertiesWithMetadata & {
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
  entityTypeIds: ["https://hash.ai/@h/types/entity-type/incurred-in/v/1"];
  properties: IncurredInProperties;
  propertiesWithMetadata: IncurredInPropertiesWithMetadata;
};

export type IncurredInOutgoingLinkAndTarget = never;

export type IncurredInOutgoingLinksByLinkEntityTypeId = {};

/**
 * Something that was incurred in something else.
 */
export type IncurredInProperties = LinkProperties & {};

export type IncurredInPropertiesWithMetadata = LinkPropertiesWithMetadata & {
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
  entityTypeIds: ["https://hash.ai/@h/types/entity-type/records-usage-of/v/1"];
  properties: RecordsUsageOfProperties;
  propertiesWithMetadata: RecordsUsageOfPropertiesWithMetadata;
};

export type RecordsUsageOfOutgoingLinkAndTarget = never;

export type RecordsUsageOfOutgoingLinksByLinkEntityTypeId = {};

/**
 * The thing that something records usage of.
 */
export type RecordsUsageOfProperties = LinkProperties & {};

export type RecordsUsageOfPropertiesWithMetadata =
  LinkPropertiesWithMetadata & {
    metadata?: ObjectMetadata;
    value: {};
  };

/**
 * The thing that something created.
 */
export type Updated = {
  entityTypeIds: ["https://hash.ai/@h/types/entity-type/updated/v/1"];
  properties: UpdatedProperties;
  propertiesWithMetadata: UpdatedPropertiesWithMetadata;
};

export type UpdatedOutgoingLinkAndTarget = never;

export type UpdatedOutgoingLinksByLinkEntityTypeId = {};

/**
 * The thing that something created.
 */
export type UpdatedProperties = LinkProperties & {};

export type UpdatedPropertiesWithMetadata = LinkPropertiesWithMetadata & {
  metadata?: ObjectMetadata;
  value: {};
};

/**
 * A record of usage of a service
 */
export type UsageRecord = {
  entityTypeIds: ["https://hash.ai/@h/types/entity-type/usage-record/v/4"];
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
  "https://hash.ai/@h/types/entity-type/created/v/1": UsageRecordCreatedLink;
  "https://hash.ai/@h/types/entity-type/incurred-in/v/1": UsageRecordIncurredInLink;
  "https://hash.ai/@h/types/entity-type/records-usage-of/v/1": UsageRecordRecordsUsageOfLink;
  "https://hash.ai/@h/types/entity-type/updated/v/1": UsageRecordUpdatedLink;
};

/**
 * A record of usage of a service
 */
export type UsageRecordProperties = {
  "https://hash.ai/@h/types/property-type/custom-metadata/"?: CustomMetadataPropertyValue;
  "https://hash.ai/@h/types/property-type/input-unit-count/"?: InputUnitCountPropertyValue;
  "https://hash.ai/@h/types/property-type/output-unit-count/"?: OutputUnitCountPropertyValue;
};

export type UsageRecordPropertiesWithMetadata = {
  metadata?: ObjectMetadata;
  value: {
    "https://hash.ai/@h/types/property-type/custom-metadata/"?: CustomMetadataPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/input-unit-count/"?: InputUnitCountPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/output-unit-count/"?: OutputUnitCountPropertyValueWithMetadata;
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
