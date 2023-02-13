import {
  type OntologyElementMetadata as OntologyElementMetadataBp,
  DataTypeWithMetadata as DataTypeWithMetadataBp,
  EntityTypeWithMetadata as EntityTypeWithMetadataBp,
  PropertyTypeWithMetadata as PropertyTypeWithMetadataBp,
} from "@blockprotocol/graph";
import {
  DataType,
  EntityType,
  PropertyType,
  validateBaseUri,
  VersionedUri,
} from "@blockprotocol/type-system/slim";
import { Brand } from "@local/advanced-types/brand";
import { Subtype } from "@local/advanced-types/subtype";

import { BaseUri, OwnedById, ProvenanceMetadata, Timestamp } from "../shared";

/**
 * The second component of the [{@link BaseUri}, RevisionId] tuple needed to identify a specific ontology type vertex
 * within a {@link Subgraph}. This should be the version number as a string.
 */
export type OntologyTypeRevisionId = Brand<
  `${number}`,
  "OntologyTypeRevisionId"
>;

export type OntologyTypeRecordId = {
  baseUri: BaseUri;
  version: number;
};

export const ontologyTypeRecordIdToVersionedUri = (
  ontologyTypeRecordId: OntologyTypeRecordId,
): VersionedUri => {
  return `${ontologyTypeRecordId.baseUri}v/${ontologyTypeRecordId.version}` as VersionedUri;
};

export const isOntologyTypeRecordId = (
  editionId: object,
): editionId is OntologyTypeRecordId => {
  return (
    "baseId" in editionId &&
    typeof editionId.baseId === "string" &&
    validateBaseUri(editionId.baseId).type !== "Err" &&
    "version" in editionId &&
    typeof editionId.version === "number" &&
    Number.isInteger(editionId.version)
  );
};

/** @todo-0.3 - Consider redefining `EntityType` and `PropertyType` to use the branded `BaseUri`s inside them */

export type OwnedOntologyElementMetadata = {
  recordId: OntologyTypeRecordId;
  ownedById: OwnedById;
  provenance: ProvenanceMetadata;
};

export type ExternalOntologyElementMetadata = {
  recordId: OntologyTypeRecordId;
  fetchedAt: Timestamp;
  provenance: ProvenanceMetadata;
};

export type OntologyElementMetadata = Subtype<
  OntologyElementMetadataBp,
  OwnedOntologyElementMetadata | ExternalOntologyElementMetadata
>;

export type DataTypeWithMetadata = Subtype<
  DataTypeWithMetadataBp,
  {
    schema: DataType;
    metadata: OntologyElementMetadata;
  }
>;

export type PropertyTypeWithMetadata = Subtype<
  PropertyTypeWithMetadataBp,
  {
    schema: PropertyType;
    metadata: OntologyElementMetadata;
  }
>;

export type EntityTypeWithMetadata = Subtype<
  EntityTypeWithMetadataBp,
  {
    schema: EntityType;
    metadata: OntologyElementMetadata;
  }
>;

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
