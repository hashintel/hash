/**
 * This file was automatically generated – do not edit it.
 */

import type { ObjectMetadata } from "@local/hash-graph-client";
import type { Entity } from "@local/hash-graph-sdk/entity";

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
} from "./shared";

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

export type Machine = Entity<MachineProperties>;

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
export type MachineProperties = MachineProperties1 & MachineProperties2;
export type MachineProperties1 = ActorProperties;

export type MachineProperties2 = {
  "https://blockprotocol.org/@blockprotocol/types/property-type/display-name/": DisplayNamePropertyValue;
  "https://hash.ai/@hash/types/property-type/machine-identifier/": MachineIdentifierPropertyValue;
};

export type MachinePropertiesWithMetadata = {
  metadata?: ObjectMetadata;
  value: {
    "https://blockprotocol.org/@blockprotocol/types/property-type/display-name/": DisplayNamePropertyValueWithMetadata;
    "https://hash.ai/@hash/types/property-type/machine-identifier/": MachineIdentifierPropertyValueWithMetadata;
  };
};
