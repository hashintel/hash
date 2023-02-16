import {
  type Entity as EntityBp,
  type EntityMetadata as EntityMetadataBp,
  type EntityPropertiesObject as EntityPropertiesObjectBp,
  type EntityPropertyValue as EntityPropertyValueBp,
  type EntityRecordId as EntityRecordIdBp,
  type EntityRevisionId as EntityRevisionIdBp,
  type EntityTemporalVersioningMetadata as EntityTemporalVersioningMetadataBp,
  type LinkData as LinkDataBp,
  type LinkEntityAndRightEntity as LinkEntityAndRightEntityBp,
  isEntityRecordId as isEntityRecordIdBp,
} from "@blockprotocol/graph";
import { VersionedUri } from "@blockprotocol/type-system/slim";
import { Brand } from "@local/advanced-types/brand";
import { Subtype } from "@local/advanced-types/subtype";

import {
  BaseUri,
  EntityId,
  ExclusiveLimitedTemporalBound,
  InclusiveLimitedTemporalBound,
  isEntityId,
  ProvenanceMetadata,
  TemporalAxis,
  TimeInterval,
  Timestamp,
  Unbounded,
} from "../shared";

// This isn't necessary, it just _could_ provide greater clarity that this corresponds to an exact vertex and can be
// used in a direct lookup and not a search in the vertices
export type EntityRevisionId = Subtype<
  EntityRevisionIdBp,
  Brand<Timestamp, "EntityRevisionId">
>;

export type EntityRecordId = Subtype<
  EntityRecordIdBp,
  {
    entityId: EntityId;
    editionId: string;
  }
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

export type EntityPropertyValue = EntityPropertyValueBp;
export type EntityPropertiesObject = Subtype<
  EntityPropertiesObjectBp,
  {
    [_: BaseUri]: EntityPropertyValue;
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
  EntityMetadataBp<true>,
  {
    recordId: EntityRecordId;
    entityTypeId: VersionedUri;
    temporalVersioning: EntityTemporalVersioningMetadata;
    archived: boolean;
    provenance: ProvenanceMetadata;
  }
>;

export type LinkData = Subtype<
  LinkDataBp,
  {
    leftToRightOrder?: number;
    rightToLeftOrder?: number;
    leftEntityId: EntityId;
    rightEntityId: EntityId;
  }
>;

export type Entity<
  Properties extends EntityPropertiesObject | null = Record<
    BaseUri,
    EntityPropertyValue
  >,
> = Subtype<
  EntityBp<true, Properties>,
  {
    metadata: EntityMetadata;
    linkData?: LinkData;
  } & (Properties extends null ? {} : { properties: Properties })
>;

export type LinkEntityAndRightEntity = Subtype<
  LinkEntityAndRightEntityBp<true>,
  {
    linkEntity: Entity[];
    rightEntity: Entity[];
  }
>;
