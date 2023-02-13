// For strange behavior we haven't found the cause of, we are unable to export
// directly here, and have to import as alias before re-exporting the type
// if we don't, the `api` package is unable to use this library.
import {
  BaseUri,
  validateBaseUri,
  VersionedUri as TVersionedUri,
} from "@blockprotocol/type-system";

export type VersionedUri = TVersionedUri;

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

export const linkEntityTypeUri: VersionedUri =
  "https://blockprotocol.org/@blockprotocol/types/entity-type/link/v/1";
