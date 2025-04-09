import type {
  OntologyTypeRecordId,
  VersionedUrl,
} from "@blockprotocol/type-system";
import type {
  ExternalOntologyElementMetadata,
  OntologyElementMetadata,
  OwnedOntologyElementMetadata,
} from "@local/hash-graph-types/ontology";

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
): metadata is OwnedOntologyElementMetadata => "webId" in metadata;
