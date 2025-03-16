/**
 * This file was automatically generated – do not edit it.
 */

import type {
  Confidence,
  ObjectMetadata,
  PropertyProvenance,
} from "@blockprotocol/type-system";

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
 * A structured query for data, including e.g. the types of filters to be applied in order to produce the data.
 */
export type Query = {
  entityTypeIds: [
    "https://blockprotocol.org/@hash/types/entity-type/query/v/1",
  ];
  properties: QueryProperties;
  propertiesWithMetadata: QueryPropertiesWithMetadata;
};

export type QueryOutgoingLinkAndTarget = never;

export type QueryOutgoingLinksByLinkEntityTypeId = {};

/**
 * A structured query for data, including e.g. the types of filters to be applied in order to produce the data.
 */
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
