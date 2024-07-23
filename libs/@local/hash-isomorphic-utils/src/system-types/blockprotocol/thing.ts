/**
 * This file was automatically generated – do not edit it.
 */

import type { ObjectMetadata } from "@local/hash-graph-client";

/**
 * A generic thing
 */
export interface Thing {
  entityTypeId: "https://blockprotocol.org/@blockprotocol/types/entity-type/thing/v/1";
  properties: ThingProperties;
  propertiesWithMetadata: ThingPropertiesWithMetadata;
}

export type ThingOutgoingLinkAndTarget = never;

export interface ThingOutgoingLinksByLinkEntityTypeId {}

/**
 * A generic thing
 */
export interface ThingProperties {}

export interface ThingPropertiesWithMetadata {
  metadata?: ObjectMetadata;
  value: ThingPropertiesWithMetadataValue;
}

export interface ThingPropertiesWithMetadataValue {}
