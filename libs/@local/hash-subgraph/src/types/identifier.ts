// For strange behavior we haven't found the cause of, we are unable to export
// directly here, and have to import as alias before re-exporting the type
// if we don't, the `api` package is unable to use this library.
import {
  BaseUri,
  validateBaseUri,
  VersionedUri as TVersionedUri,
} from "@blockprotocol/type-system";

import { EntityId, isEntityId, Timestamp } from "./shared";

export type VersionedUri = TVersionedUri;

export type EntityVertexId = {
  baseId: EntityId;
  version: Timestamp;
};

/**
 * A tuple struct of a given `EntityId` and timestamp, used to identify an `Entity` at a given moment of time, where
 * that time may be any time in an `Entity`'s lifespan (and thus the timestamp is *not* necessarily equal to an
 * `EntityVersion`)
 */
export type EntityIdAndTimestamp = {
  baseId: EntityId;
  timestamp: Timestamp;
};

export type OntologyTypeVertexId = {
  baseId: BaseUri;
  version: number;
};

export type OntologyTypeRecordId = {
  baseUri: BaseUri;
  version: number;
};

export type GraphElementVertexId = EntityVertexId | OntologyTypeVertexId;

export const ontologyTypeRecordIdToVersionedUri = (
  ontologyTypeRecordId: OntologyTypeRecordId,
): VersionedUri => {
  return `${ontologyTypeRecordId.baseUri}v/${ontologyTypeRecordId.version}` as VersionedUri;
};

export const isEntityVertexId = (
  vertexId: object,
): vertexId is EntityVertexId => {
  return (
    "baseId" in vertexId &&
    typeof vertexId.baseId === "string" &&
    isEntityId(vertexId.baseId) &&
    "version" in vertexId &&
    typeof vertexId.version === "string" &&
    !Number.isNaN(Date.parse(vertexId.version))
  );
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

export const isEntityIdAndTimestamp = (
  entityIdAndTimestamp: object,
): entityIdAndTimestamp is EntityIdAndTimestamp => {
  return (
    "baseId" in entityIdAndTimestamp &&
    typeof entityIdAndTimestamp.baseId === "string" &&
    isEntityId(entityIdAndTimestamp.baseId) &&
    "timestamp" in entityIdAndTimestamp &&
    typeof entityIdAndTimestamp.timestamp === "string" &&
    !Number.isNaN(Date.parse(entityIdAndTimestamp.timestamp))
  );
};

export const linkEntityTypeUri: VersionedUri =
  "https://blockprotocol.org/@blockprotocol/types/entity-type/link/v/1";
