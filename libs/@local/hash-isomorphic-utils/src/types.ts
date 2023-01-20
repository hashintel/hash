import {
  EntityId as EntityIdSubgraph,
  entityIdFromOwnedByIdAndEntityUuid as entityIdFromOwnedByIdAndEntityUuidSubgraph,
  extractEntityUuidFromEntityId as extractEntityUuidFromEntityIdSubgraph,
  extractOwnedByIdFromEntityId as extractOwnedByIdFromEntityIdSubgraph,
  splitEntityId as splitEntityIdSubgraph,
} from "../hash-subgraph/src";

type BrandedBase<Base, Kind extends {}> = Base & {
  // The property prefixes are chosen such that they shouldn't appear in intellisense.

  /** The type of the value space that is branded */
  readonly "#base": Base;
  /** The unique name for the branded type */
  readonly "#kind": Kind;
};

/**
 * The type-branding type to support nominal (name based) types
 */
export type Brand<Base, Kind extends string> = Base extends BrandedBase<
  infer NestedBase,
  infer NestedKind
>
  ? BrandedBase<NestedBase, NestedKind & { [_ in Kind]: true }>
  : BrandedBase<Base, { [_ in Kind]: true }>;

/** Valid Uuids of the system */
export type Uuid = Brand<string, "Uuid">;

/** An ID to uniquely identify an account (e.g. a User or an Org) */
export type AccountId = Brand<Uuid, "AccountId">;

/** An ID to uniquely identify an entity */
export type EntityId = Brand<EntityIdSubgraph, "EntityId">;

/** An account ID of an actor that is the owner of something */
export type OwnedById = Brand<AccountId, "OwnedById">;
/** An account ID of an actor that has updated something */
export type UpdatedById = Brand<AccountId, "UpdatedById">;

/** A `Uuid` that points to an Entity without any edition */
export type EntityUuid = Brand<Uuid, "EntityUuid">;

/** An `EntityId` which is the base of an Account Entity */
export type AccountEntityId = Brand<EntityId, "AccountEntityId">;

// These type overwrites are centralized for being able to swap out implementations.

export const splitEntityId = splitEntityIdSubgraph as (
  entityId: EntityIdSubgraph,
) => [OwnedById, EntityUuid];

export const extractOwnedByIdFromEntityId =
  extractOwnedByIdFromEntityIdSubgraph as (
    entityId: EntityIdSubgraph,
  ) => OwnedById;

export const extractEntityUuidFromEntityId =
  extractEntityUuidFromEntityIdSubgraph as (
    entityId: EntityIdSubgraph,
  ) => EntityUuid;

/** If the underlying entityUuid is an accountId, use this cast to convert the type */
export const extractAccountId = extractEntityUuidFromEntityIdSubgraph as (
  entityId: AccountEntityId,
  // The type cannot be cast directly to AccountId, so we do it over two casts, but without `unknown`
) => string as (entityId: AccountEntityId) => AccountId;

export const entityIdFromOwnedByIdAndEntityUuid =
  entityIdFromOwnedByIdAndEntityUuidSubgraph as (
    ownedById: OwnedById,
    entityUuid: EntityUuid,
  ) => EntityIdSubgraph as (
    ownedById: OwnedById,
    entityUuid: EntityUuid,
  ) => EntityId;
