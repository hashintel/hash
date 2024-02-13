/**
 * This file was automatically generated – do not edit it.
 */

import { Entity } from "@blockprotocol/graph";

import {
  ActorV2,
  ActorV2OutgoingLinkAndTarget,
  ActorV2OutgoingLinksByLinkEntityTypeId,
  ActorV2Properties,
  DisplayNamePropertyValue,
  TextDataType,
} from "./shared";

export type {
  ActorV2,
  ActorV2OutgoingLinkAndTarget,
  ActorV2OutgoingLinksByLinkEntityTypeId,
  ActorV2Properties,
  DisplayNamePropertyValue,
  TextDataType,
};

export type Machine = Entity<MachineProperties>;

/**
 * A unique identifier for a machine
 */
export type MachineIdentifierPropertyValue = TextDataType;

export type MachineOutgoingLinkAndTarget = never;

export type MachineOutgoingLinksByLinkEntityTypeId = {};

/**
 * A machine that can perform actions in the system
 */
export type MachineProperties = MachineProperties1 & MachineProperties2;
export type MachineProperties1 = ActorV2Properties;

export type MachineProperties2 = {
  "https://blockprotocol.org/@blockprotocol/types/property-type/display-name/": DisplayNamePropertyValue;
  "https://hash.ai/@hash/types/property-type/machine-identifier/": MachineIdentifierPropertyValue;
};
