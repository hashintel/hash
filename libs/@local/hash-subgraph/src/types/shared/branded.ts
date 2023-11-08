import {
  BaseUrl as BaseUrlBp,
  validateBaseUrl,
  VersionedUrl,
} from "@blockprotocol/type-system/slim";
import { Brand } from "@local/advanced-types/brand";
import {
  DataTypeRelationAndSubject,
  EntityRelationAndSubject,
  EntityTypeInstantiatorSubject as EntityTypeInstantiatorSubjectGraph,
  EntityTypeRelationAndSubject,
  PropertyTypeRelationAndSubject,
  WebRelationAndSubject,
} from "@local/hash-graph-client";
import { validate as validateUuid } from "uuid";

export type BaseUrl = Brand<BaseUrlBp, "BaseUrl">;

export const isBaseUrl = (baseUrl: string): baseUrl is BaseUrl => {
  return validateBaseUrl(baseUrl).type === "Ok";
};

/** Valid Uuids of the system */
export type Uuid = Brand<string, "Uuid">;

/** An ID to uniquely identify an account (e.g. a User) */
export type AccountId = Brand<Uuid, "AccountId">;

/** An ID to uniquely identify an account group (e.g. an Org) */
export type AccountGroupId = Brand<Uuid, "AccountGroupId">;

/** An ID to uniquely identify an authorization subject (either a User or an Org) */
export type AuthorizationSubjectId = AccountId | AccountGroupId;

/** An account ID of an actor that is the owner of something */
export type OwnedById = Brand<AccountId | AccountGroupId, "OwnedById">;

/** A `Uuid` that points to an Entity without any edition */
export type EntityUuid = Brand<Uuid, "EntityUuid">;

export const ENTITY_ID_DELIMITER = "~";

/** An ID to uniquely identify an entity */
export type EntityId = Brand<
  `${OwnedById}${typeof ENTITY_ID_DELIMITER}${EntityUuid}`,
  "EntityId"
>;

export const isEntityId = (entityId: string): entityId is EntityId => {
  const [accountId, entityUuid] = entityId.split(ENTITY_ID_DELIMITER);
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
  return `${ownedById}${ENTITY_ID_DELIMITER}${entityUuid}` as EntityId;
};

export const splitEntityId = (entityId: EntityId): [OwnedById, EntityUuid] => {
  const [ownedById, entityUuid] = entityId.split(ENTITY_ID_DELIMITER);
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

/** An account ID of an actor that has created a record */
export type RecordArchivedById = Brand<AccountId, "RecordArchivedById">;

/** An `EntityId` identifying a `User` Entity */
export type AccountEntityId = Brand<EntityId, "AccountEntityId">;

/** An `EntityId`identifying an Account Group Entity, e.g. an `Org` */
export type AccountGroupEntityId = Brand<EntityId, "AccountGroupEntityId">;

/** If the underlying `EntityUuid` is an `AccountId`, use this cast to convert the type */
export const extractAccountId = extractEntityUuidFromEntityId as (
  entityId: AccountEntityId,
  // The type cannot be cast directly to `AccountId`, so we do it over two casts, but without `unknown`
) => string as (entityId: AccountEntityId) => AccountId;

/** If the underlying `EntityUuid` is an `AccountGroupId`, use this cast to convert the type */
export const extractAccountGroupId = extractEntityUuidFromEntityId as (
  entityId: AccountGroupEntityId,
  // The type cannot be cast directly to `AccountGroupId`, so we do it over two casts, but without `unknown`
) => string as (entityId: AccountGroupEntityId) => AccountGroupId;

type ReplaceAccount<T extends { kind: "account" }> = {
  [P in keyof T]: P extends "subjectId" ? AccountId : T[P];
};
type ReplaceAccountGroup<T extends { kind: "accountGroup" }> = {
  [P in keyof T]: P extends "subjectId" ? AccountGroupId : T[P];
};

type BrandSubject<T extends object> = T extends { kind: "account" }
  ? ReplaceAccount<T>
  : T extends { kind: "accountGroup" }
  ? ReplaceAccountGroup<T>
  : T;

type BrandRelationship<T extends { subject: object }> = {
  [K in keyof T]: K extends "subject" ? BrandSubject<T[K]> : T[K];
};

export type WebAuthorizationRelationship = {
  resource: {
    kind: "web";
    resourceId: OwnedById;
  };
} & BrandRelationship<WebRelationAndSubject>;

export type EntityAuthorizationRelationship = {
  resource: {
    kind: "entity";
    resourceId: EntityId;
  };
} & BrandRelationship<EntityRelationAndSubject>;

export type EntityTypeAuthorizationRelationship = {
  resource: {
    kind: "entityType";
    resourceId: VersionedUrl;
  };
} & BrandRelationship<EntityTypeRelationAndSubject>;
export type EntityTypeInstantiatorSubject =
  BrandSubject<EntityTypeInstantiatorSubjectGraph>;

export type PropertyTypeAuthorizationRelationship = {
  resource: {
    kind: "propertyType";
    resourceId: VersionedUrl;
  };
} & BrandRelationship<PropertyTypeRelationAndSubject>;

export type DataTypeAuthorizationRelationship = {
  resource: {
    kind: "dataType";
    resourceId: VersionedUrl;
  };
} & BrandRelationship<DataTypeRelationAndSubject>;
