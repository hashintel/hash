import {
  type OntologyElementMetadata as OntologyElementMetadataBp,
  DataTypeWithMetadata as DataTypeWithMetadataBp,
  EntityTypeWithMetadata as EntityTypeWithMetadataBp,
  PropertyTypeWithMetadata as PropertyTypeWithMetadataBp,
} from "@blockprotocol/graph";
import { DataType, EntityType, PropertyType } from "@blockprotocol/type-system";
import { Brand } from "@local/advanced-types/brand";
import { Subtype } from "@local/advanced-types/subtype";
import { OwnedById } from "@local/hash-subgraph/types/branded";
import { ProvenanceMetadata } from "@local/hash-subgraph/types/shared";

import { OntologyTypeRecordId, Timestamp } from "../identifier";

/**
 * The second component of the [{@link BaseUri}, RevisionId] tuple needed to identify a specific ontology type vertex
 * within a {@link Subgraph}. This should be the version number as a string.
 */
export type OntologyTypeRevisionId = Brand<
  `${number}`,
  "OntologyTypeRevisionId"
>;

export type OwnedOntologyElementMetadata = {
  recordId: OntologyTypeRecordId;
  ownedById: OwnedById;
  provenance: ProvenanceMetadata;
};

export type ExternalOntologyElementMetadata = {
  recordId: OntologyTypeRecordId;
  fetchedAt: Timestamp;
  provenance: ProvenanceMetadata;
  /** @todo-0.3 `ownedById` shouldn't be required in the BP ontology metadata */
  ownedById: OwnedById;
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
