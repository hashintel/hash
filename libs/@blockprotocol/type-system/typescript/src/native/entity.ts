import type {
  DraftId,
  EntityId,
  EntityMetadata as RustEntityMetadata,
  EntityUuid,
  LinkData,
  OwnedById,
  PropertyArrayMetadata,
  PropertyArrayWithMetadata,
  PropertyMetadata,
  PropertyObject,
  PropertyObjectMetadata,
  PropertyObjectWithMetadata,
  PropertyPath,
  PropertyValueMetadata,
  PropertyValueWithMetadata,
  PropertyWithMetadata,
  VersionedUrl,
} from "@blockprotocol/type-system-rs";
import { validate as validateUuid } from "uuid";

export type TypeIdsAndPropertiesForEntity = {
  entityTypeIds: [VersionedUrl, ...VersionedUrl[]];
  properties: PropertyObject;
  propertiesWithMetadata: PropertyObjectWithMetadata;
};

/**
 * This redefinition allows for (1) a generic with default, (2) 'at least one' entityTypeId,
 * both of which the Rust->TS codegen does not support.
 */
export type EntityMetadata<
  TypeIds extends [VersionedUrl, ...VersionedUrl[]] = [
    VersionedUrl,
    ...VersionedUrl[],
  ],
> = Omit<RustEntityMetadata, "entityTypeIds"> & {
  entityTypeIds: TypeIds;
};

export interface Entity<
  TypeIdsAndProperties extends
    TypeIdsAndPropertiesForEntity = TypeIdsAndPropertiesForEntity,
> {
  metadata: EntityMetadata;

  entityId: EntityId;

  properties: TypeIdsAndProperties["properties"];

  propertiesWithMetadata: TypeIdsAndProperties["propertiesWithMetadata"];

  propertiesMetadata: PropertyObjectMetadata;

  propertyMetadata: (path: PropertyPath) => PropertyMetadata | undefined;

  flattenedPropertiesMetadata: () => {
    path: PropertyPath;
    metadata: PropertyMetadata["metadata"];
  }[];

  linkData: LinkData | undefined;
}

export interface LinkEntity<
  TypeIdsAndProperties extends
    TypeIdsAndPropertiesForEntity = TypeIdsAndPropertiesForEntity,
> extends Entity<TypeIdsAndProperties> {
  linkData: LinkData;
}

export const ENTITY_ID_DELIMITER = "~";

export const isEntityId = (entityId: string): entityId is EntityId => {
  const [accountId, entityUuid, draftId] = entityId.split(ENTITY_ID_DELIMITER);
  return (
    accountId !== undefined &&
    validateUuid(accountId) &&
    entityUuid !== undefined &&
    validateUuid(entityUuid) &&
    (!draftId || validateUuid(draftId))
  );
};

export const entityIdFromComponents = (
  ownedById: OwnedById,
  entityUuid: EntityUuid,
  draftId?: DraftId,
): EntityId => {
  const base = `${ownedById}${ENTITY_ID_DELIMITER}${entityUuid}`;

  if (!draftId) {
    return base as EntityId;
  }

  return `${base}${ENTITY_ID_DELIMITER}${draftId}` as EntityId;
};

export const splitEntityId = (
  entityId: EntityId,
): [OwnedById, EntityUuid, DraftId?] => {
  const [ownedById, entityUuid, draftId] = entityId.split(ENTITY_ID_DELIMITER);
  return [ownedById as OwnedById, entityUuid as EntityUuid, draftId as DraftId];
};

export const stripDraftIdFromEntityId = (entityId: EntityId) => {
  const [ownedById, entityUuid] = splitEntityId(entityId);
  return entityIdFromComponents(ownedById, entityUuid);
};

export const extractOwnedByIdFromEntityId = (entityId: EntityId): OwnedById => {
  return splitEntityId(entityId)[0];
};

export const extractEntityUuidFromEntityId = (
  entityId: EntityId,
): EntityUuid => {
  return splitEntityId(entityId)[1];
};

export const extractDraftIdFromEntityId = (
  entityId: EntityId,
): DraftId | undefined => {
  return splitEntityId(entityId)[2];
};

export const isValueMetadata = (
  metadata: PropertyMetadata,
): metadata is PropertyValueMetadata =>
  !!metadata.metadata && "dataTypeId" in metadata.metadata;

export const isArrayMetadata = (
  metadata: PropertyMetadata,
): metadata is PropertyArrayMetadata =>
  !isValueMetadata(metadata) && Array.isArray(metadata.value);

export const isObjectMetadata = (
  metadata: PropertyMetadata,
): metadata is PropertyObjectMetadata =>
  !isValueMetadata(metadata) && !Array.isArray(metadata.value);

export const isValueWithMetadata = (
  metadata: PropertyWithMetadata,
): metadata is PropertyValueWithMetadata =>
  metadata.metadata !== undefined && "dataTypeId" in metadata.metadata;

export const isArrayWithMetadata = (
  metadata: PropertyWithMetadata,
): metadata is PropertyArrayWithMetadata =>
  !isValueWithMetadata(metadata) && Array.isArray(metadata.value);

export const isObjectWithMetadata = (
  metadata: PropertyWithMetadata,
): metadata is PropertyObjectWithMetadata =>
  !isValueWithMetadata(metadata) && !Array.isArray(metadata.value);
