/**
 * This file was automatically generated – do not edit it.
 */

import type { ObjectMetadata } from "@local/hash-graph-client";
import type {
  EntityProperties,
  PropertyObject,
  PropertyObjectValueMetadata,
} from "@local/hash-graph-types/entity";

/**
 * A generic thing
 */
export interface Thing extends EntityProperties {
  entityTypeId: "https://blockprotocol.org/@blockprotocol/types/entity-type/thing/v/1";
  properties: ThingProperties;
  propertiesWithMetadata: ThingPropertiesWithMetadata;
}

export type ThingOutgoingLinkAndTarget = never;

export interface ThingOutgoingLinksByLinkEntityTypeId {}

/**
 * A generic thing
 */
export interface ThingProperties extends PropertyObject {}

export interface ThingPropertiesWithMetadata {
  metadata?: ObjectMetadata;
  value: ThingPropertiesWithMetadataValue;
}

export interface ThingPropertiesWithMetadataValue
  extends PropertyObjectValueMetadata {}
