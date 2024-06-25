import type { VersionedUrl } from "@blockprotocol/type-system/slim";
import type { Brand } from "@local/advanced-types/brand";
import type {
  DataTypeRelationAndSubject as DataTypeRelationAndSubjectGraph,
  EntityRelationAndSubject as EntityRelationAndSubjectGraph,
  EntityTypeInstantiatorSubject as EntityTypeInstantiatorSubjectGraph,
  EntityTypeRelationAndSubject as EntityTypeRelationAndSubjectGraph,
  PropertyTypeRelationAndSubject as PropertyTypeRelationAndSubjectGraph,
  WebRelationAndSubject as WebRelationAndSubjectGraph,
} from "@local/hash-graph-client";
import type {
  AccountGroupId,
  AccountId,
} from "@local/hash-graph-types/account";
import type {
  DraftId,
  EntityId,
  EntityUuid,
} from "@local/hash-graph-types/entity";
import { ENTITY_ID_DELIMITER } from "@local/hash-graph-types/entity";
import type { OwnedById } from "@local/hash-graph-types/web";
import { validate as validateUuid } from "uuid";

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
