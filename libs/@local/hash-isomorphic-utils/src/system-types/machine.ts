/**
 * This file was automatically generated – do not edit it.
 */

import type { ObjectMetadata } from "@local/hash-graph-client";

import type {
  Actor,
  ActorOutgoingLinkAndTarget,
  ActorOutgoingLinksByLinkEntityTypeId,
  ActorProperties,
  ActorPropertiesWithMetadata,
  DisplayNamePropertyValue,
  DisplayNamePropertyValueWithMetadata,
  TextDataType,
  TextDataTypeWithMetadata,
} from "./shared.js";

export type {
  Actor,
  ActorOutgoingLinkAndTarget,
  ActorOutgoingLinksByLinkEntityTypeId,
  ActorProperties,
  ActorPropertiesWithMetadata,
  DisplayNamePropertyValue,
  DisplayNamePropertyValueWithMetadata,
  TextDataType,
  TextDataTypeWithMetadata,
};

/**
 * A machine that can perform actions in the system
 */
export type Machine = {
  entityTypeIds: ["https://hash.ai/@h/types/entity-type/machine/v/2"];
  properties: MachineProperties;
  propertiesWithMetadata: MachinePropertiesWithMetadata;
};

/**
 * A unique identifier for a machine
 */
export type MachineIdentifierPropertyValue = TextDataType;

export type MachineIdentifierPropertyValueWithMetadata =
  TextDataTypeWithMetadata;

export type MachineOutgoingLinkAndTarget = never;

export type MachineOutgoingLinksByLinkEntityTypeId = {};

/**
 * A machine that can perform actions in the system
 */
export type MachineProperties = ActorProperties & {
  "https://blockprotocol.org/@blockprotocol/types/property-type/display-name/": DisplayNamePropertyValue;
  "https://hash.ai/@h/types/property-type/machine-identifier/": MachineIdentifierPropertyValue;
};

export type MachinePropertiesWithMetadata = ActorPropertiesWithMetadata & {
  metadata?: ObjectMetadata;
  value: {
    "https://blockprotocol.org/@blockprotocol/types/property-type/display-name/": DisplayNamePropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/machine-identifier/": MachineIdentifierPropertyValueWithMetadata;
  };
};
