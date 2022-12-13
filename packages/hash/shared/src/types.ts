import {
  EntityId,
  extractEntityUuidFromEntityId as extractEntityUuidFromEntityIdSubGraph,
  extractOwnedByIdFromEntityId as extractOwnedByIdFromEntityIdSubGraph,
  splitEntityId as splitEntityIdSubGraph,
} from "@hashintel/hash-subgraph";

type Branded<Base, Kind extends string> = {
  /** The type of the value space that is branded */
  readonly _base: Base;
  /** The unique name for the branded type. */
  readonly _kind: Kind;
};

/**
 * The type-branding type to support nominal (name based) types.
 */
export type Brand<Base, Kind extends string> = Base & Branded<Base, Kind>;

/** An account ID of an actor that is the owner of something */
export type OwnedById = Brand<string, "OwnedById">;
/** An account ID of an actor that has updated something */
export type UpdatedById = Brand<string, "UpdatedById">;
/** An ID to uniquely identify an account (e.g. a User or an Org) */
export type AccountId = Brand<string, "AccountId"> | OwnedById | UpdatedById;

/** A Uuuid that points to an Entity without any edition */
export type EntityUuid = Brand<string, "EntityUuid">;
/** Valid Uuids of the system */
export type Uuid = Brand<string, "Uuid"> | AccountId | EntityUuid;

// These type overwrites are centralized for being able to swap out implementations.

export const splitEntityId = splitEntityIdSubGraph as (
  entityId: EntityId,
) => [OwnedById, EntityUuid];

export const extractOwnedByIdFromEntityId =
  extractOwnedByIdFromEntityIdSubGraph as (entityId: EntityId) => OwnedById;

export const extractEntityUuidFromEntityId =
  extractEntityUuidFromEntityIdSubGraph as (entityId: EntityId) => EntityUuid;

/** If the underlying entityUuid is an accountId, use this cast to convert the type */
export const extractAccountIdAsEntityUuid =
  extractEntityUuidFromEntityIdSubGraph as (entityId: EntityId) => AccountId;
