/**
 * This file was automatically generated – do not edit it.
 */

import type { Entity } from "@local/hash-subgraph";

import type {
  ObjectDataType,
  TextDataType,
  TriggerDefinitionIDPropertyValue,
} from "./shared";

export type { ObjectDataType, TextDataType, TriggerDefinitionIDPropertyValue };

export type FlowDefinition = Entity<FlowDefinitionProperties>;

export type FlowDefinitionOutgoingLinkAndTarget = never;

export type FlowDefinitionOutgoingLinksByLinkEntityTypeId = {};

/**
 * The definition of  a HASH flow.
 */
export type FlowDefinitionProperties = {
  "https://blockprotocol.org/@blockprotocol/types/property-type/name/": NamePropertyValue;
  "https://hash.ai/@hash/types/property-type/output-definitions/": OutputDefinitionsPropertyValue;
  "https://hash.ai/@hash/types/property-type/step-definitions/": StepDefinitionsPropertyValue;
  "https://hash.ai/@hash/types/property-type/trigger-definition/": TriggerDefinitionPropertyValue;
};

/**
 * A word or set of words by which something is known, addressed, or referred to.
 */
export type NamePropertyValue = TextDataType;

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
