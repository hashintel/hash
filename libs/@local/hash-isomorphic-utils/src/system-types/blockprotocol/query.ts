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
export interface ObjectDataType {}

export interface ObjectDataTypeWithMetadata {
  value: ObjectDataType;
  metadata: ObjectDataTypeMetadata;
}
export interface ObjectDataTypeMetadata {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://blockprotocol.org/@blockprotocol/types/data-type/object/v/1";
}

/**
 *
 */
export interface Query {
  entityTypeId: "https://blockprotocol.org/@hash/types/entity-type/query/v/1";
  properties: QueryProperties;
  propertiesWithMetadata: QueryPropertiesWithMetadata;
}

export type QueryOutgoingLinkAndTarget = never;

export interface QueryOutgoingLinksByLinkEntityTypeId {}

export interface QueryProperties {
  "https://blockprotocol.org/@hash/types/property-type/query/": QueryPropertyValue;
}

export interface QueryPropertiesWithMetadata {
  metadata?: ObjectMetadata;
  value: QueryPropertiesWithMetadataValue;
}

export interface QueryPropertiesWithMetadataValue {
  "https://blockprotocol.org/@hash/types/property-type/query/": QueryPropertyValueWithMetadata;
}

/**
 * The query for something.
 */
export type QueryPropertyValue = ObjectDataType;

export interface QueryPropertyValueWithMetadata
  extends ObjectDataTypeWithMetadata {}
