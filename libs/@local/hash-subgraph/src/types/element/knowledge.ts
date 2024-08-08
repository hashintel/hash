import type {
  EntityRevisionId as EntityRevisionIdBp,
  isEntityRecordId as isEntityRecordIdBp,
} from "@blockprotocol/graph";
import type { Brand } from "@local/advanced-types/brand";
import type { Subtype } from "@local/advanced-types/subtype";
import type { DiffEntityParams } from "@local/hash-graph-client";
import type { Entity, LinkEntity } from "@local/hash-graph-sdk/entity";
import type { EntityId, EntityRecordId } from "@local/hash-graph-types/entity";
import type { Timestamp } from "@local/hash-graph-types/temporal-versioning";

import { isEntityId } from "../shared.js";

// This isn't necessary, it just _could_ provide greater clarity that this corresponds to an exact vertex and can be
// used in a direct lookup and not a search in the vertices
export type EntityRevisionId = Subtype<
  EntityRevisionIdBp,
  Brand<Timestamp, "EntityRevisionId">
>;

/**
 * A string representation of an `EntityRecordId`.
 * Can be useful for storing in keys of objects and other similar string-focused situations.
 */
export type EntityRecordIdString = `${EntityId}/v/${string}`;

export const entityRecordIdToString = (
  entityRecordId: EntityRecordId,
): EntityRecordIdString =>
  `${entityRecordId.entityId}/v/${entityRecordId.editionId}`;

export const isEntityRecordId: typeof isEntityRecordIdBp = (
  recordId: unknown,
): recordId is EntityRecordId => {
  return (
    recordId != null &&
    typeof recordId === "object" &&
    "entityId" in recordId &&
    typeof recordId.entityId === "string" &&
    isEntityId(recordId.entityId) &&
    "editionId" in recordId
  );
};

export type LinkEntityAndRightEntity = {
  linkEntity: LinkEntity[];
  rightEntity: Entity[];
};

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
