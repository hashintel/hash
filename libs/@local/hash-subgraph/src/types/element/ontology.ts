import { DataType, EntityType, PropertyType } from "@blockprotocol/type-system";
import { ProvenanceMetadata } from "@local/hash-subgraph/types/shared";

import { OntologyTypeRecordId, Timestamp } from "../identifier";

export type OwnedOntologyElementMetadata = {
  recordId: OntologyTypeRecordId;
  ownedById: string;
  provenance: ProvenanceMetadata;
};

export type ExternalOntologyElementMetadata = {
  recordId: OntologyTypeRecordId;
  fetchedAt: Timestamp;
  provenance: ProvenanceMetadata;
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
