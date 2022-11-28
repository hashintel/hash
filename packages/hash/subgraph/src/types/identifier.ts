import { OntologyTypeEditionId } from "@hashintel/hash-graph-client";
import { validate as validateUuid } from "uuid";

// For strange behavior we haven't found the cause of, we are unable to export
// directly here, and have to import as alias before re-exporting the type
// if we don't, the `api` package is unable to use this library.
import { VersionedUri as TVersionedUri } from "@blockprotocol/type-system-web";

export type VersionedUri = TVersionedUri;

// `${AccountId}%${EntityUuid}`
export type EntityId = `${string}%${string}`;

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

// ISO-formatted datetime string
export type EntityVersion = Timestamp;

/**
 * An identifier of a specific edition of an `Entity` at a given `EntityVersion`
 */
export type EntityEditionId = {
  baseId: EntityId;
  version: EntityVersion;
};

/**
 * A string representation of an `EntityEditionId`.
 * Can be useful for storing in keys of objects and other similar string-focused situations.
 */
export type EntityEditionIdString = `${EntityId}/v/${EntityVersion}`;

export const entityEditionIdToString = (
  entityEditionId: EntityEditionId,
): EntityEditionIdString =>
  `${entityEditionId.baseId}/v/${entityEditionId.version}`;

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

export type GraphElementEditionId = EntityEditionId | OntologyTypeEditionId;

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

export const isEntityEditionId = (
  editionId: object,
): editionId is EntityEditionId => {
  return (
    "baseId" in editionId &&
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore-expect -- This is fixed in TS 4.9
    typeof editionId.baseId === "string" &&
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore-expect -- This is fixed in TS 4.9
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    isEntityId(editionId.baseId) &&
    "version" in editionId &&
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore-expect -- This is fixed in TS 4.9
    typeof editionId.version === "string" &&
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore-expect -- This is fixed in TS 4.9
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    !Number.isNaN(Date.parse(editionId.version))
  );
};

export const isOntologyTypeEditionId = (
  editionId: object,
): editionId is OntologyTypeEditionId => {
  return (
    "baseId" in editionId &&
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore-expect -- This is fixed in TS 4.9
    typeof editionId.baseId === "string" &&
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore-expect -- This is fixed in TS 4.9
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    isEntityId(editionId.baseId) &&
    "version" in editionId &&
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore-expect -- This is fixed in TS 4.9
    typeof editionId.version === "number" &&
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore-expect -- This is fixed in TS 4.9
    Number.isInteger(editionId.version)
  );
};

export const isEntityAndTimestamp = (
  editionId: object,
): editionId is EntityIdAndTimestamp => {
  return (
    "baseId" in editionId &&
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore-expect -- This is fixed in TS 4.9
    typeof editionId.baseId === "string" &&
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore-expect -- This is fixed in TS 4.9
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    isEntityId(editionId.baseId) &&
    "timestamp" in editionId &&
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore-expect -- This is fixed in TS 4.9
    typeof editionId.timestamp === "string" &&
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore-expect -- This is fixed in TS 4.9
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    !Number.isNaN(Date.parse(editionId.timestamp))
  );
};
