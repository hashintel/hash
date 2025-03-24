import type { EntityId, Timestamp } from "@blockprotocol/type-system";
import type { Brand } from "@local/advanced-types/brand";
import type { Subtype } from "@local/advanced-types/subtype";
import type { DiffEntityParams } from "@local/hash-graph-client";
import type { Entity, LinkEntity } from "@local/hash-graph-sdk/entity";

/** An `EntityId` identifying a `User` Entity */
export type ActorEntityId = Brand<EntityId, "ActorEntityId">;

/** An `EntityId`identifying an Account Group Entity, e.g. an `Org` */
export type ActorGroupEntityId = Brand<EntityId, "ActorGroupEntityId">;

export type DiffEntityInput = Subtype<
  DiffEntityParams,
  {
    firstEntityId: EntityId;
    firstTransactionTime: Timestamp | null;
    firstDecisionTime: Timestamp | null;
    secondEntityId: EntityId;
    secondDecisionTime: Timestamp | null;
    secondTransactionTime: Timestamp | null;
  }
>;

export type LinkEntityAndRightEntity = {
  linkEntity: LinkEntity[];
  rightEntity: Entity[];
};

export type LinkEntityAndLeftEntity = {
  linkEntity: LinkEntity[];
  leftEntity: Entity[];
};
