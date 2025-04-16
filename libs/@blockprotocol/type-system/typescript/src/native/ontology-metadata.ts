import type {
  DataTypeMetadata,
  EntityTypeMetadata,
  PropertyTypeMetadata,
} from "@blockprotocol/type-system-rs";

export type OntologyElementMetadata =
  | EntityTypeMetadata
  | PropertyTypeMetadata
  | DataTypeMetadata;

export const isExternalOntologyElementMetadata = <
  Metadata extends OntologyElementMetadata,
>(
  metadata: Metadata,
): metadata is Metadata & { fetchedAt: string } => "fetchedAt" in metadata;

export const isOwnedOntologyElementMetadata = <
  Metadata extends OntologyElementMetadata,
>(
  metadata: Metadata,
): metadata is Metadata & { webId: string } => "webId" in metadata;
