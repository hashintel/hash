import type {
  OntologyTypeRecordId,
  VersionedUrl,
} from "@blockprotocol/type-system";
import type { Brand } from "@local/advanced-types/brand";
import type {
  ExternalOntologyElementMetadata,
  OntologyElementMetadata,
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

export const isExternalOntologyElementMetadata = (
  metadata: OntologyElementMetadata,
): metadata is ExternalOntologyElementMetadata => "fetchedAt" in metadata;

export const isOwnedOntologyElementMetadata = (
  metadata: OntologyElementMetadata,
): metadata is OwnedOntologyElementMetadata => "ownedById" in metadata;
