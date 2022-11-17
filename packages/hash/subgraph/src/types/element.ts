import {
  DataTypeWithMetadata as DataTypeWithMetadataGraphApi,
  Entity as EntityGraphApi,
  EntityTypeWithMetadata as EntityTypeWithMetadataGraphApi,
  PropertyTypeWithMetadata as PropertyTypeWithMetadataGraphApi,
} from "@hashintel/hash-graph-client";
import {
  DataType,
  EntityType,
  PropertyType,
} from "@blockprotocol/type-system-node";

// Due to restrictions with how much OpenAPI can express, we patch the schemas with the better-typed ones from the
// type-system package.

export type DataTypeWithMetadata = Omit<
  DataTypeWithMetadataGraphApi,
  "schema"
> & { schema: DataType };

export type PropertyTypeWithMetadata = Omit<
  PropertyTypeWithMetadataGraphApi,
  "schema"
> & { schema: PropertyType };

export type EntityTypeWithMetadata = Omit<
  EntityTypeWithMetadataGraphApi,
  "schema"
> & { schema: EntityType };

export type Entity = EntityGraphApi;

export type GraphElement =
  | DataTypeWithMetadata
  | PropertyTypeWithMetadata
  | EntityTypeWithMetadata
  | Entity;
