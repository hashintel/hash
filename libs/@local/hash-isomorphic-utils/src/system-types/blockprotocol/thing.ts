/**
 * This file was automatically generated – do not edit it.
 */

import type { ObjectMetadata } from "@local/hash-graph-client";

/**
 * A generic thing
 */
export type Thing = {
  entityTypeIds: [
    "https://blockprotocol.org/@blockprotocol/types/entity-type/thing/v/1",
  ];
  properties: ThingProperties;
  propertiesWithMetadata: ThingPropertiesWithMetadata;
};

export type ThingOutgoingLinkAndTarget = never;

export type ThingOutgoingLinksByLinkEntityTypeId = {};

/**
 * A generic thing
 */
export type ThingProperties = {};

export type ThingPropertiesWithMetadata = {
  metadata?: ObjectMetadata;
  value: {};
};
