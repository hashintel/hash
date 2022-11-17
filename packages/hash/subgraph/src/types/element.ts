import {
  DataTypeWithMetadata as DataTypeWithMetadataGraphApi,
  EntityTypeWithMetadata as EntityTypeWithMetadataGraphApi,
  PropertyTypeWithMetadata as PropertyTypeWithMetadataGraphApi,
  ProvenanceMetadata as ProvenanceMetadataGraphApi,
} from "@hashintel/hash-graph-client";
import {
  BaseUri,
  DataType,
  EntityType,
  PropertyType,
  VersionedUri,
} from "@blockprotocol/type-system-node";
import { EntityEditionId, EntityId } from "./identifier";

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

/** Plain JSON value and object definitions */
type JsonValue = string | number | boolean | JsonObject | JsonValue[];
type JsonObject = {
  [_: string]: JsonValue;
};

/**
 * Entity Properties are JSON objects with `BaseUri`s as keys, _except_ when there is a Data Type of primitive type
 * `object` in which case the nested objects become plain `JsonObject`s
 */
type PropertyValue = JsonValue | PropertyObject;
export type PropertyObject = {
  [_: BaseUri]: PropertyValue;
};

export type EntityMetadata = {
  archived: boolean;
  editionId: EntityEditionId;
  entityTypeId: VersionedUri;
  linkMetadata?: {
    leftOrder?: number;
    rightOrder?: number;
    leftEntityId: EntityId;
    rightEntityId: EntityId;
  };
  provenance: ProvenanceMetadataGraphApi;
};

export type Entity = {
  properties: PropertyObject;
  metadata: EntityMetadata;
};

export type GraphElement =
  | DataTypeWithMetadata
  | PropertyTypeWithMetadata
  | EntityTypeWithMetadata
  | Entity;
