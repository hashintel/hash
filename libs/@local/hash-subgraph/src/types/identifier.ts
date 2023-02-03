// For strange behavior we haven't found the cause of, we are unable to export
// directly here, and have to import as alias before re-exporting the type
// if we don't, the `api` package is unable to use this library.
import { VersionedUri as TVersionedUri } from "@blockprotocol/type-system";
import { OntologyTypeEditionId } from "@local/hash-graph-client";
import { validate as validateUuid } from "uuid";

export type VersionedUri = TVersionedUri;

// `${AccountId}%${EntityUuid}`
export type EntityId = `${string}%${string}`;

/** @todo - consider Type Branding this */
export const entityIdFromOwnedByIdAndEntityUuid = (
  ownedById: string,
  entityUuid: string,
): EntityId => {
  return `${ownedById}%${entityUuid}`;
};

/** @todo - consider Type Branding this */
export const splitEntityId = (entityId: EntityId): [string, string] => {
  const [ownedById, entityUuid] = entityId.split("%");
  return [ownedById!, entityUuid!];
};

export const extractOwnedByIdFromEntityId = (entityId: EntityId): string => {
  return splitEntityId(entityId)[0]!;
};

export const extractEntityUuidFromEntityId = (entityId: EntityId): string => {
  return splitEntityId(entityId)[1]!;
};

/** @todo - consider Type Branding this */
export type Timestamp = string;

export type VersionInterval = {
  start: Timestamp;
  end: Timestamp | null;
};

export type EntityVersion = {
  decisionTime: VersionInterval;
  transactionTime: VersionInterval;
};

export type EntityRecordId = string;

/**
 * An identifier of a specific edition of an `Entity` at a given `EntityRecordId`
 */
export type EntityEditionId = {
  baseId: EntityId;
  recordId: EntityRecordId;
};

export type EntityVertexId = {
  baseId: EntityId;
  version: Timestamp;
};

/**
 * A string representation of an `EntityEditionId`.
 * Can be useful for storing in keys of objects and other similar string-focused situations.
 */
export type EntityEditionIdString = `${EntityId}/v/${EntityRecordId}`;

export const entityEditionIdToString = (
  entityEditionId: EntityEditionId,
): EntityEditionIdString =>
  `${entityEditionId.baseId}/v/${entityEditionId.recordId}`;

/**
 * A tuple struct of a given `EntityId` and timestamp, used to identify an `Entity` at a given moment of time, where
 * that time may be any time in an `Entity`'s lifespan (and thus the timestamp is *not* necessarily equal to an
 * `EntityVersion`)
 */
export type EntityIdAndTimestamp = {
  baseId: EntityId;
  timestamp: Timestamp;
};

export type { OntologyTypeEditionId };

export type GraphElementVertexId = EntityVertexId | OntologyTypeEditionId;

export const ontologyTypeEditionIdToVersionedUri = (
  ontologyTypeEditionId: OntologyTypeEditionId,
): VersionedUri => {
  return `${ontologyTypeEditionId.baseId}v/${ontologyTypeEditionId.version}` as VersionedUri;
};

export const isEntityId = (entityId: string): entityId is EntityId => {
  const [accountId, entityUuid] = entityId.split("%");
  return (
    accountId != null &&
    entityUuid != null &&
    validateUuid(accountId) &&
    validateUuid(entityUuid)
  );
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

export const isOntologyTypeEditionId = (
  editionId: object,
): editionId is OntologyTypeEditionId => {
  return (
    "baseId" in editionId &&
    typeof editionId.baseId === "string" &&
    isEntityId(editionId.baseId) &&
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
