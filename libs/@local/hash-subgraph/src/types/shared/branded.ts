import {
  BaseUrl as BaseUrlBp,
  validateBaseUrl,
} from "@blockprotocol/type-system/slim";
import { Brand } from "@local/advanced-types/brand";
import { validate as validateUuid } from "uuid";

export type BaseUrl = Brand<BaseUrlBp, "BaseUrl">;

export const isBaseUrl = (baseUrl: string): baseUrl is BaseUrl => {
  return validateBaseUrl(baseUrl).type === "Ok";
};

/** Valid Uuids of the system */
export type Uuid = Brand<string, "Uuid">;

/** An ID to uniquely identify an account (e.g. a User or an Org) */
export type AccountId = Brand<Uuid, "AccountId">;

/** An account ID of an actor that is the owner of something */
export type OwnedById = Brand<AccountId, "OwnedById">;

/** A `Uuid` that points to an Entity without any edition */
export type EntityUuid = Brand<Uuid, "EntityUuid">;

/** An ID to uniquely identify an entity */
export type EntityId = Brand<`${OwnedById}%${EntityUuid}`, "EntityId">;

export const isEntityId = (entityId: string): entityId is EntityId => {
  const [accountId, entityUuid] = entityId.split("%");
  return (
    accountId != null &&
    entityUuid != null &&
    validateUuid(accountId) &&
    validateUuid(entityUuid)
  );
};

export const entityIdFromOwnedByIdAndEntityUuid = (
  ownedById: OwnedById,
  entityUuid: EntityUuid,
): EntityId => {
  return `${ownedById}%${entityUuid}` as EntityId;
};

export const splitEntityId = (entityId: EntityId): [OwnedById, EntityUuid] => {
  const [ownedById, entityUuid] = entityId.split("%");
  return [ownedById as OwnedById, entityUuid as EntityUuid];
};

export const extractOwnedByIdFromEntityId = (entityId: EntityId): OwnedById => {
  return splitEntityId(entityId)[0]!;
};

export const extractEntityUuidFromEntityId = (
  entityId: EntityId,
): EntityUuid => {
  return splitEntityId(entityId)[1]!;
};

/** An account ID of an actor that has created a record */
export type RecordCreatedById = Brand<AccountId, "RecordCreatedById">;

/** An `EntityId` which is the base of an Account Entity */
export type AccountEntityId = Brand<EntityId, "AccountEntityId">;

/** If the underlying entityUuid is an accountId, use this cast to convert the type */
export const extractAccountId = extractEntityUuidFromEntityId as (
  entityId: AccountEntityId,
  // The type cannot be cast directly to AccountId, so we do it over two casts, but without `unknown`
) => string as (entityId: AccountEntityId) => AccountId;
