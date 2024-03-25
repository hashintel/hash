import type {
  BaseUrl as BaseUrlBp,
  VersionedUrl,
} from "@blockprotocol/type-system/slim";
import { validateBaseUrl } from "@blockprotocol/type-system/slim";
import type { Brand } from "@local/advanced-types/brand";
import type {
  DataTypeRelationAndSubject as DataTypeRelationAndSubjectGraph,
  EntityRelationAndSubject as EntityRelationAndSubjectGraph,
  EntityTypeInstantiatorSubject as EntityTypeInstantiatorSubjectGraph,
  EntityTypeRelationAndSubject as EntityTypeRelationAndSubjectGraph,
  PropertyTypeRelationAndSubject as PropertyTypeRelationAndSubjectGraph,
  WebRelationAndSubject as WebRelationAndSubjectGraph,
} from "@local/hash-graph-client";
import { validate as validateUuid } from "uuid";

import type { Timestamp } from "./temporal-versioning";

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

/** The draft identifier for an entity */
export type DraftId = Brand<Uuid, "DraftId">;

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

export const entityIdFromComponents = (
  ownedById: OwnedById,
  entityUuid: EntityUuid,
  draftId?: DraftId,
): EntityId => {
  const base = `${ownedById}${ENTITY_ID_DELIMITER}${entityUuid}`;

  if (draftId) {
    return base as EntityId;
  }

  return `${ownedById}${ENTITY_ID_DELIMITER}${entityUuid}` as EntityId;
};

export const splitEntityId = (
  entityId: EntityId,
): [OwnedById, EntityUuid, DraftId?] => {
  const [ownedById, entityUuid, draftId] = entityId.split(ENTITY_ID_DELIMITER);
  return [ownedById as OwnedById, entityUuid as EntityUuid, draftId as DraftId];
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

/** An account ID of creating actor */
export type CreatedById = Brand<AccountId, "CreatedById">;

/** The transaction time when the record was inserted into the database the first time */
export type CreatedAtTransactionTime = Brand<
  Timestamp,
  "CreatedAtTransactionTime"
>;

/** The transaction time when the record was inserted into the database the first time. This does not take into account
 *  if an updated later happened with a decision time before the initial decision time. */
export type CreatedAtDecisionTime = Brand<Timestamp, "CreatedAtDecisionTime">;

/** An account ID of an actor that has created a specific edition */
export type EditionCreatedById = Brand<AccountId, "EditionCreatedById">;

/** An account ID of an actor that has archived an edition */
export type EditionArchivedById = Brand<AccountId, "EditionArchivedById">;

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

export type EntityTypeInstantiatorSubject =
  BrandSubject<EntityTypeInstantiatorSubjectGraph>;

export type WebRelationAndSubject =
  BrandRelationship<WebRelationAndSubjectGraph>;
export type WebAuthorizationRelationship = {
  resource: {
    kind: "web";
    resourceId: OwnedById;
  };
} & WebRelationAndSubject;

export type EntityRelationAndSubject =
  BrandRelationship<EntityRelationAndSubjectGraph>;
export type EntityAuthorizationRelationship = {
  resource: {
    kind: "entity";
    resourceId: EntityId;
  };
} & EntityRelationAndSubject;

export type EntityTypeRelationAndSubject =
  BrandRelationship<EntityTypeRelationAndSubjectGraph>;
export type EntityTypeAuthorizationRelationship = {
  resource: {
    kind: "entityType";
    resourceId: VersionedUrl;
  };
} & EntityTypeRelationAndSubject;

export type PropertyTypeRelationAndSubject =
  BrandRelationship<PropertyTypeRelationAndSubjectGraph>;
export type PropertyTypeAuthorizationRelationship = {
  resource: {
    kind: "propertyType";
    resourceId: VersionedUrl;
  };
} & PropertyTypeRelationAndSubject;

export type DataTypeRelationAndSubject =
  BrandRelationship<DataTypeRelationAndSubjectGraph>;
export type DataTypeAuthorizationRelationship = {
  resource: {
    kind: "dataType";
    resourceId: VersionedUrl;
  };
} & DataTypeRelationAndSubject;
