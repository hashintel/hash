/**
 * This file was automatically generated – do not edit it.
 */

import type { SimpleEntity } from "@local/hash-graph-types/entity";

import type {
  DescriptionPropertyValue,
  NamePropertyValue,
  ObjectDataType,
  TextDataType,
  TriggerDefinitionIDPropertyValue,
} from "./shared";

export type {
  DescriptionPropertyValue,
  NamePropertyValue,
  ObjectDataType,
  TextDataType,
  TriggerDefinitionIDPropertyValue,
};

export type FlowDefinition = SimpleEntity<FlowDefinitionProperties>;

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

/**
 * The output definitions of something.
 */
export type OutputDefinitionsPropertyValue = ObjectDataType[];

/**
 * The step definitions of a flow.
 */
export type StepDefinitionsPropertyValue = ObjectDataType[];

/**
 * The trigger definition of a flow.
 */
export type TriggerDefinitionPropertyValue = {
  "https://hash.ai/@hash/types/property-type/output-definitions/"?: OutputDefinitionsPropertyValue;
  "https://hash.ai/@hash/types/property-type/trigger-definition-id/": TriggerDefinitionIDPropertyValue;
};
