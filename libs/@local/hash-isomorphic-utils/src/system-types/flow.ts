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
  "https://hash.ai/@hash/types/property-type/outputs/"?: OutputsPropertyValue;
  "https://hash.ai/@hash/types/property-type/step/": StepPropertyValue;
  "https://hash.ai/@hash/types/property-type/trigger/": TriggerPropertyValue;
};

/**
 * The outputs of something.
 */
export type OutputsPropertyValue = ObjectDataType[];

/**
 * A step in a flow run.
 */
export type StepPropertyValue = ObjectDataType[];

/**
 * The trigger of a flow.
 */
export type TriggerPropertyValue = {
  "https://hash.ai/@hash/types/property-type/outputs/"?: OutputsPropertyValue;
  "https://hash.ai/@hash/types/property-type/trigger-definition-id/": TriggerDefinitionIDPropertyValue;
};
