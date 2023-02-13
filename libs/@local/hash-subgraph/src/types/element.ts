import { BaseUri, VersionedUri } from "@blockprotocol/type-system";
import {
  DataTypeWithMetadata,
  EntityTypeWithMetadata,
  PropertyTypeWithMetadata,
} from "./element/ontology";

import { EntityId } from "./branded";
import { EntityRecordId, EntityVersion } from "./identifier";
import { ProvenanceMetadata } from "./shared";

export * from "./element/ontology";

// Due to restrictions with how much OpenAPI can express, we patch the schemas with the better-typed ones from the
// type-system package.

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
  provenance: ProvenanceMetadata;
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
