import type { VersionedUrl } from "@blockprotocol/type-system/slim";
import { validateBaseUrl } from "@blockprotocol/type-system/slim";
import type { Brand } from "@local/advanced-types/brand";
import type {
  DataTypeMetadata,
  EntityTypeMetadata,
  ExternalOntologyElementMetadata,
  OntologyTypeRecordId,
  OwnedOntologyElementMetadata,
} from "@local/hash-graph-types/ontology";

/**
 * The second component of the [{@link BaseUrl}, RevisionId] tuple needed to identify a specific ontology type vertex
 * within a {@link Subgraph}. This should be the version number as a string.
 */
export type OntologyTypeRevisionId = Brand<
  `${number}`,
  "OntologyTypeRevisionId"
>;

export const ontologyTypeRecordIdToVersionedUrl = (
  ontologyTypeRecordId: OntologyTypeRecordId,
): VersionedUrl => {
  return `${ontologyTypeRecordId.baseUrl}v/${ontologyTypeRecordId.version}`;
};

export const isOntologyTypeRecordId = (
  editionId: object,
): editionId is OntologyTypeRecordId => {
  return (
    "baseId" in editionId &&
    typeof editionId.baseId === "string" &&
    validateBaseUrl(editionId.baseId).type !== "Err" &&
    "version" in editionId &&
    typeof editionId.version === "number" &&
    Number.isInteger(editionId.version)
  );
};

export const isExternalOntologyElementMetadata = (
  metadata: DataTypeMetadata | EntityTypeMetadata,
): metadata is ExternalOntologyElementMetadata => "fetchedAt" in metadata;

export const isOwnedOntologyElementMetadata = (
  metadata: DataTypeMetadata | EntityTypeMetadata,
): metadata is OwnedOntologyElementMetadata => "ownedById" in metadata;
