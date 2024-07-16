/**
 * This file was automatically generated – do not edit it.
 */

import type {
  ObjectMetadata,
  PropertyProvenance,
} from "@local/hash-graph-client";
import type { Confidence } from "@local/hash-graph-types/entity";

/**
 * An opaque, untyped JSON object
 */
export type ObjectDataType = {};

export type ObjectDataTypeWithMetadata = {
  value: ObjectDataType;
  metadata: ObjectDataTypeMetadata;
};
export type ObjectDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://blockprotocol.org/@blockprotocol/types/data-type/object/v/1";
};

/**
 *
 */
export type Query = {
  entityTypeId: "https://blockprotocol.org/@hash/types/entity-type/query/v/1";
  properties: QueryProperties;
  propertiesWithMetadata: QueryPropertiesWithMetadata;
};

export type QueryOutgoingLinkAndTarget = never;

export type QueryOutgoingLinksByLinkEntityTypeId = {};

export type QueryProperties = {
  "https://blockprotocol.org/@hash/types/property-type/query/": QueryPropertyValue;
};

export type QueryPropertiesWithMetadata = {
  metadata?: ObjectMetadata;
  value: {
    "https://blockprotocol.org/@hash/types/property-type/query/": QueryPropertyValueWithMetadata;
  };
};

/**
 * The query for something.
 */
export type QueryPropertyValue = ObjectDataType;

export type QueryPropertyValueWithMetadata = ObjectDataTypeWithMetadata;
