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
 * A machine that can perform actions in the system.
 */
export interface Machine {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/machine/v/2";
  properties: MachineProperties;
  propertiesWithMetadata: MachinePropertiesWithMetadata;
}

/**
 * A unique identifier for a machine.
 */
export type MachineIdentifierPropertyValue = TextDataType;

export type MachineIdentifierPropertyValueWithMetadata =
  TextDataTypeWithMetadata;

export type MachineOutgoingLinkAndTarget = never;

export interface MachineOutgoingLinksByLinkEntityTypeId {}

/**
 * A machine that can perform actions in the system.
 */
export type MachineProperties = MachineProperties1 & MachineProperties2;
export type MachineProperties1 = ActorProperties;

export interface MachineProperties2 {
  "https://blockprotocol.org/@blockprotocol/types/property-type/display-name/": DisplayNamePropertyValue;
  "https://hash.ai/@hash/types/property-type/machine-identifier/": MachineIdentifierPropertyValue;
}

export type MachinePropertiesWithMetadata = MachinePropertiesWithMetadata1 &
  MachinePropertiesWithMetadata2;
export type MachinePropertiesWithMetadata1 = ActorPropertiesWithMetadata;

export interface MachinePropertiesWithMetadata2 {
  metadata?: ObjectMetadata;
  value: {
    "https://blockprotocol.org/@blockprotocol/types/property-type/display-name/": DisplayNamePropertyValueWithMetadata;
    "https://hash.ai/@hash/types/property-type/machine-identifier/": MachineIdentifierPropertyValueWithMetadata;
  };
}
