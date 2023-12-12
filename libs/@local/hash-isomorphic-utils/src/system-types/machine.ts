/**
 * This file was automatically generated – do not edit it.
 */

import { Entity } from "@blockprotocol/graph";

import {
  Actor,
  ActorOutgoingLinkAndTarget,
  ActorOutgoingLinksByLinkEntityTypeId,
  ActorProperties,
  PreferredNamePropertyValue,
  TextDataType,
} from "./shared";

export type {
  Actor,
  ActorOutgoingLinkAndTarget,
  ActorOutgoingLinksByLinkEntityTypeId,
  ActorProperties,
  PreferredNamePropertyValue,
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
export type MachineProperties1 = ActorProperties;

export type MachineProperties2 = {
  "https://hash.ai/@hash/types/property-type/machine-identifier/": MachineIdentifierPropertyValue;
};
