/**
 * This file was automatically generated – do not edit it.
 */

import type { ArrayMetadata, ObjectMetadata } from "@local/hash-graph-client";

import type {
  DescriptionPropertyValue,
  DescriptionPropertyValueWithMetadata,
  NamePropertyValue,
  NamePropertyValueWithMetadata,
  ObjectDataType,
  ObjectDataTypeWithMetadata,
  TextDataType,
  TextDataTypeWithMetadata,
  TriggerDefinitionIDPropertyValue,
  TriggerDefinitionIDPropertyValueWithMetadata,
} from "./shared.js";

export type {
  DescriptionPropertyValue,
  DescriptionPropertyValueWithMetadata,
  NamePropertyValue,
  NamePropertyValueWithMetadata,
  ObjectDataType,
  ObjectDataTypeWithMetadata,
  TextDataType,
  TextDataTypeWithMetadata,
  TriggerDefinitionIDPropertyValue,
  TriggerDefinitionIDPropertyValueWithMetadata,
};

/**
 * The definition of a HASH flow.
 */
export type FlowDefinition = {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/flow-definition/v/1";
  properties: FlowDefinitionProperties;
  propertiesWithMetadata: FlowDefinitionPropertiesWithMetadata;
};

export type FlowDefinitionOutgoingLinkAndTarget = never;

export type FlowDefinitionOutgoingLinksByLinkEntityTypeId = {};

/**
 * The definition of a HASH flow.
 */
export type FlowDefinitionProperties = {
  "https://blockprotocol.org/@blockprotocol/types/property-type/description/": DescriptionPropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/name/": NamePropertyValue;
  "https://hash.ai/@hash/types/property-type/output-definitions/": OutputDefinitionsPropertyValue;
  "https://hash.ai/@hash/types/property-type/step-definitions/": StepDefinitionsPropertyValue;
  "https://hash.ai/@hash/types/property-type/trigger-definition/": TriggerDefinitionPropertyValue;
};

export type FlowDefinitionPropertiesWithMetadata = {
  metadata?: ObjectMetadata;
  value: {
    "https://blockprotocol.org/@blockprotocol/types/property-type/description/": DescriptionPropertyValueWithMetadata;
    "https://blockprotocol.org/@blockprotocol/types/property-type/name/": NamePropertyValueWithMetadata;
    "https://hash.ai/@hash/types/property-type/output-definitions/": OutputDefinitionsPropertyValueWithMetadata;
    "https://hash.ai/@hash/types/property-type/step-definitions/": StepDefinitionsPropertyValueWithMetadata;
    "https://hash.ai/@hash/types/property-type/trigger-definition/": TriggerDefinitionPropertyValueWithMetadata;
  };
};

/**
 * The output definitions of something.
 */
export type OutputDefinitionsPropertyValue = ObjectDataType[];

export type OutputDefinitionsPropertyValueWithMetadata = {
  value: ObjectDataTypeWithMetadata[];
  metadata?: ArrayMetadata;
};

/**
 * The step definitions of a flow.
 */
export type StepDefinitionsPropertyValue = ObjectDataType[];

export type StepDefinitionsPropertyValueWithMetadata = {
  value: ObjectDataTypeWithMetadata[];
  metadata?: ArrayMetadata;
};

/**
 * The trigger definition of a flow.
 */
export type TriggerDefinitionPropertyValue = {
  "https://hash.ai/@hash/types/property-type/output-definitions/"?: OutputDefinitionsPropertyValue;
  "https://hash.ai/@hash/types/property-type/trigger-definition-id/": TriggerDefinitionIDPropertyValue;
};

export type TriggerDefinitionPropertyValueWithMetadata = {
  metadata?: ObjectMetadata;
  value: {
    "https://hash.ai/@hash/types/property-type/output-definitions/"?: OutputDefinitionsPropertyValueWithMetadata;
    "https://hash.ai/@hash/types/property-type/trigger-definition-id/": TriggerDefinitionIDPropertyValueWithMetadata;
  };
};
