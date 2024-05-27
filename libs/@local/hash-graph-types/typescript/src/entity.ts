import type {
  EntityMetadata as EntityMetadataBp,
  EntityTemporalVersioningMetadata as EntityTemporalVersioningMetadataBp,
  LinkData as LinkDataBp,
} from "@blockprotocol/graph/temporal";
import type { VersionedUrl } from "@blockprotocol/type-system";
import type { Brand } from "@local/advanced-types/brand";
import type { Subtype } from "@local/advanced-types/subtype";
import type {
  ActorType,
  PropertyMetadataMap,
  ProvidedEntityEditionProvenanceOrigin,
  SourceProvenance,
} from "@local/hash-graph-client";
import type { EntityRecordId } from "@local/hash-subgraph";

import type {
  CreatedById,
  EditionArchivedById,
  EditionCreatedById,
} from "./account";
import type { Uuid } from "./branded";
import type {
  CreatedAtDecisionTime,
  CreatedAtTransactionTime,
  ExclusiveLimitedTemporalBound,
  InclusiveLimitedTemporalBound,
  TemporalAxis,
  TimeInterval,
  Unbounded,
} from "./temporal-versioning";
import type { OwnedById } from "./web";

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

type HalfClosedInterval = TimeInterval<
  InclusiveLimitedTemporalBound,
  ExclusiveLimitedTemporalBound | Unbounded
>;

export type EntityTemporalVersioningMetadata = Subtype<
  EntityTemporalVersioningMetadataBp,
  Record<TemporalAxis, HalfClosedInterval>
>;

export type EntityMetadata = Subtype<
  EntityMetadataBp,
  {
    recordId: EntityRecordId;
    entityTypeId: VersionedUrl;
    temporalVersioning: EntityTemporalVersioningMetadata;
    archived: boolean;
    provenance: EntityProvenance;
    confidence?: number;
    properties?: PropertyMetadataMap;
  }
>;

export type LinkData = Subtype<
  LinkDataBp,
  {
    leftEntityId: EntityId;
    rightEntityId: EntityId;
    leftEntityConfidence?: number;
    rightEntityConfidence?: number;
  }
>;

export type EntityProvenance = {
  createdById: CreatedById;
  createdAtTransactionTime: CreatedAtTransactionTime;
  createdAtDecisionTime: CreatedAtDecisionTime;
  edition: EntityEditionProvenance;
  firstNonDraftCreatedAtDecisionTime?: CreatedAtDecisionTime;
  firstNonDraftCreatedAtTransactionTime?: CreatedAtTransactionTime;
};

export type EntityEditionProvenance = {
  createdById: EditionCreatedById;
  archivedById?: EditionArchivedById;
  actorType?: ActorType;
  origin?: ProvidedEntityEditionProvenanceOrigin;
  sources?: Array<SourceProvenance>;
};
