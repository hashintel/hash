/**
 * This file was automatically generated – do not edit it.
 */

import type { ObjectMetadata } from "@local/hash-graph-client";
import type { EntityProperties } from "@local/hash-graph-types/entity";

import type {
  Actor,
  ActorOutgoingLinkAndTarget,
  ActorOutgoingLinksByLinkEntityTypeId,
  ActorProperties,
  ActorPropertiesWithMetadata,
  ActorPropertiesWithMetadataValue,
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
  ActorPropertiesWithMetadataValue,
  DisplayNamePropertyValue,
  DisplayNamePropertyValueWithMetadata,
  TextDataType,
  TextDataTypeWithMetadata,
};

/**
 * A machine that can perform actions in the system
 */
export interface Machine extends EntityProperties {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/machine/v/2";
  properties: MachineProperties;
  propertiesWithMetadata: MachinePropertiesWithMetadata;
}

/**
 * A unique identifier for a machine
 */
export type MachineIdentifierPropertyValue = TextDataType;

export interface MachineIdentifierPropertyValueWithMetadata
  extends TextDataTypeWithMetadata {}

export type MachineOutgoingLinkAndTarget = never;

export interface MachineOutgoingLinksByLinkEntityTypeId {}

/**
 * A machine that can perform actions in the system
 */
export interface MachineProperties
  extends MachineProperties1,
    MachineProperties2 {}
export interface MachineProperties1 extends ActorProperties {}

export interface MachineProperties2 {
  "https://blockprotocol.org/@blockprotocol/types/property-type/display-name/": DisplayNamePropertyValue;
  "https://hash.ai/@hash/types/property-type/machine-identifier/": MachineIdentifierPropertyValue;
}

export interface MachinePropertiesWithMetadata {
  metadata?: ObjectMetadata;
  value: MachinePropertiesWithMetadataValue;
}

export interface MachinePropertiesWithMetadataValue
  extends MachinePropertiesWithMetadataValue1,
    MachinePropertiesWithMetadataValue2 {}
export interface MachinePropertiesWithMetadataValue1
  extends ActorPropertiesWithMetadataValue {}

export interface MachinePropertiesWithMetadataValue2 {
  "https://blockprotocol.org/@blockprotocol/types/property-type/display-name/": DisplayNamePropertyValueWithMetadata;
  "https://hash.ai/@hash/types/property-type/machine-identifier/": MachineIdentifierPropertyValueWithMetadata;
}
