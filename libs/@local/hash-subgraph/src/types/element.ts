import {
  BaseUri,
  DataType,
  EntityType,
  PropertyType,
  VersionedUri,
} from "@blockprotocol/type-system";
import { ProvenanceMetadata as ProvenanceMetadataGraphApi } from "@local/hash-graph-client";

import {
  EntityId,
  EntityRecordId,
  EntityVersion,
  OntologyTypeRecordId,
  Timestamp,
} from "./identifier";

// Due to restrictions with how much OpenAPI can express, we patch the schemas with the better-typed ones from the
// type-system package.

export type OwnedOntologyElementMetadata = {
  recordId: OntologyTypeRecordId;
  ownedById: string;
  provenance: ProvenanceMetadataGraphApi;
};

export type ExternalOntologyElementMetadata = {
  recordId: OntologyTypeRecordId;
  fetchedAt: Timestamp;
  provenance: ProvenanceMetadataGraphApi;
};

export type OntologyElementMetadata =
  | OwnedOntologyElementMetadata
  | ExternalOntologyElementMetadata;

export type DataTypeWithMetadata = {
  schema: DataType;
  metadata: OntologyElementMetadata;
};

export type PropertyTypeWithMetadata = {
  schema: PropertyType;
  metadata: OntologyElementMetadata;
};

export type EntityTypeWithMetadata = {
  schema: EntityType;
  metadata: OntologyElementMetadata;
};

export const isExternalOntologyElementMetadata = (
  metadata: OntologyElementMetadata,
): metadata is ExternalOntologyElementMetadata =>
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- this can be undefined if the cast is wrong
  (metadata as ExternalOntologyElementMetadata).fetchedAt !== undefined;

export const isOwnedOntologyElementMetadata = (
  metadata: OntologyElementMetadata,
): metadata is OwnedOntologyElementMetadata =>
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- this can be undefined if the cast is wrong
  (metadata as OwnedOntologyElementMetadata).ownedById !== undefined;

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
  recordId: EntityRecordId;
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
