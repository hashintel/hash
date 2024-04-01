/**
 * This file was automatically generated – do not edit it.
 */

import type { Entity } from "@local/hash-subgraph";

import type { ObjectDataType, TextDataType } from "./shared";

export type { ObjectDataType, TextDataType };

export type Flow = Entity<FlowProperties>;

/**
 * The ID of the flow definition (the `entityId` of the flow definition entity).
 */
export type FlowDefinitionIDPropertyValue = TextDataType;

export type FlowOutgoingLinkAndTarget = never;

export type FlowOutgoingLinksByLinkEntityTypeId = {};

/**
 * A HASH flow run.
 */
export type FlowProperties = {
  "https://hash.ai/@hash/types/property-type/flow-definition-id/": FlowDefinitionIDPropertyValue;
  "https://hash.ai/@hash/types/property-type/inputs/"?: InputsPropertyValue;
  "https://hash.ai/@hash/types/property-type/outputs/"?: OutputsPropertyValue;
  "https://hash.ai/@hash/types/property-type/step/": StepPropertyValue;
  "https://hash.ai/@hash/types/property-type/trigger/": TriggerPropertyValue;
};

/**
 * The inputs of something.
 */
export type InputsPropertyValue = ObjectDataType[];

/**
 * The outputs of something.
 */
export type OutputsPropertyValue = ObjectDataType[];

/**
 * A step in a flow run.
 */
export type StepPropertyValue = ObjectDataType[];

/**
 * The ID of the trigger definition.
 */
export type TriggerDefinitionIDPropertyValue = TextDataType;

/**
 * The trigger of a flow.
 */
export type TriggerPropertyValue = {
  "https://hash.ai/@hash/types/property-type/trigger-definition-id/": TriggerDefinitionIDPropertyValue;
};
