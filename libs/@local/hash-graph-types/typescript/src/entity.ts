import type { EntityPropertyValue } from "@blockprotocol/graph";
import type {
  EntityMetadata as EntityMetadataBp,
  EntityRecordId as EntityRecordIdBp,
  EntityTemporalVersioningMetadata as EntityTemporalVersioningMetadataBp,
  LinkData as LinkDataBp,
} from "@blockprotocol/graph/temporal";
import type { VersionedUrl } from "@blockprotocol/type-system";
import type { Brand } from "@local/advanced-types/brand";
import type { Subtype } from "@local/advanced-types/subtype";
import type {
  ActorType,
  ArrayMetadata,
  ObjectMetadata,
  ProvidedEntityEditionProvenanceOrigin,
  SourceProvenance,
  ValueMetadata,
} from "@local/hash-graph-client";

import type {
  CreatedById,
  EditionArchivedById,
  EditionCreatedById,
} from "./account";
import type { Uuid } from "./branded";
import type { BaseUrl } from "./ontology";
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

export type EntityRecordId = Subtype<
  EntityRecordIdBp,
  {
    entityId: EntityId;
    editionId: string;
  }
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
  }
>;

export type PropertyMetadataElement =
  | PropertyMetadataArray
  | PropertyMetadataObject
  | PropertyMetadataValue;

export interface PropertyMetadataValue {
  metadata: Omit<ValueMetadata, "dataTypeId"> & {
    dataTypeId?: VersionedUrl;
  };
}

export interface PropertyMetadataObject {
  properties: Record<BaseUrl, PropertyMetadataElement>;
  metadata?: ObjectMetadata;
}

export interface PropertyMetadataArray {
  elements: PropertyMetadataElement[];
  metadata?: ArrayMetadata;
}

export type PropertyPath = [BaseUrl, ...(BaseUrl | number)[]];

export type LinkData = Subtype<
  LinkDataBp,
  {
    leftEntityId: EntityId;
    rightEntityId: EntityId;
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

export type EntityPropertiesObject = Record<BaseUrl, EntityPropertyValue>;
