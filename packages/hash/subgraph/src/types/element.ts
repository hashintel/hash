import {
  BaseUri,
  DataType,
  EntityType,
  PropertyType,
  VersionedUri,
} from "@blockprotocol/type-system";
import {
  DataTypeWithMetadata as DataTypeWithMetadataGraphApi,
  EntityTypeWithMetadata as EntityTypeWithMetadataGraphApi,
  PropertyTypeWithMetadata as PropertyTypeWithMetadataGraphApi,
  ProvenanceMetadata as ProvenanceMetadataGraphApi,
} from "@hashintel/hash-graph-client";

import { EntityEditionId, EntityId, EntityVersion } from "./identifier";

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

export type { OntologyElementMetadata } from "@hashintel/hash-graph-client";

/** Plain JSON value and object definitions */
type JsonValue = null | string | number | boolean | JsonObject | JsonValue[];
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

export type LinkData = {
  leftToRightOrder?: number;
  rightToLeftOrder?: number;
  leftEntityId: EntityId;
  rightEntityId: EntityId;
};

export type EntityMetadata = {
  archived: boolean;
  editionId: EntityEditionId;
  version: EntityVersion;
  entityTypeId: VersionedUri;
  provenance: ProvenanceMetadataGraphApi;
};

export type Entity = {
  properties: PropertyObject;
  linkData?: LinkData;
  metadata: EntityMetadata;
};

export type GraphElement =
  | DataTypeWithMetadata
  | PropertyTypeWithMetadata
  | EntityTypeWithMetadata
  | Entity;
