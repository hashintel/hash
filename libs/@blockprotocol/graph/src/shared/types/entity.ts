import type {
  JsonObject as CoreJsonObject,
  JsonValue as CoreJsonValue,
} from "@blockprotocol/core";
import { BaseUrl, VersionedUrl } from "@blockprotocol/type-system/slim";

import {
  EntityRootType,
  ExclusiveLimitedTemporalBound,
  InclusiveLimitedTemporalBound,
  QueryTemporalAxesUnresolved,
  Subgraph,
  TemporalAxis,
  TimeInterval,
  Timestamp,
  Unbounded,
} from "../types.js";
import { GraphResolveDepths } from "./subgraph/graph-resolve-depths.js";

export type JsonObject = CoreJsonObject;
export type JsonValue = CoreJsonValue;

/** @todo - Consider branding these */
/** @todo - Add documentation for these if we keep them */
export type EntityId = string;
// This isn't necessary, it just _could_ provide greater clarity that this corresponds to an exact vertex and can be
// used in a direct lookup and not a search in the vertices
export type EntityRevisionId = Timestamp;

export type EntityRecordId = {
  entityId: EntityId;
  editionId: string;
};

export const isEntityRecordId = (
  recordId: unknown,
): recordId is EntityRecordId => {
  return (
    recordId != null &&
    typeof recordId === "object" &&
    "entityId" in recordId &&
    "editionId" in recordId
  );
};

/**
 * Entity Properties are JSON objects with `BaseUrl`s as keys, _except_ when there is a Data Type of primitive type
 * `object` in which case the nested objects become plain `JsonObject`s
 */
export type EntityPropertyValue = JsonValue | EntityPropertiesObject;
export type EntityPropertiesObject = {
  [_: BaseUrl]: EntityPropertyValue;
};

type HalfClosedInterval = TimeInterval<
  InclusiveLimitedTemporalBound,
  ExclusiveLimitedTemporalBound | Unbounded
>;

export type EntityTemporalVersioningMetadata = Record<
  TemporalAxis,
  HalfClosedInterval
>;

export type EntityMetadata<Temporal extends boolean> = {
  recordId: EntityRecordId;
  entityTypeId: VersionedUrl;
} & (Temporal extends true
  ? { temporalVersioning: EntityTemporalVersioningMetadata }
  : { temporalVersioning?: never });

export type LinkData = {
  leftToRightOrder?: number;
  rightToLeftOrder?: number;
  leftEntityId: EntityId;
  rightEntityId: EntityId;
};

export type Entity<
  Temporal extends boolean,
  Properties extends EntityPropertiesObject | null = Record<
    BaseUrl,
    EntityPropertyValue
  >,
> = {
  metadata: EntityMetadata<Temporal>;
  linkData?: LinkData;
} & (Properties extends null
  ? { properties?: never }
  : { properties: Properties });

export type LinkEntityAndRightEntity<Temporal extends boolean> = {
  // In a temporal system there may be multiple revisions of both link entities and their right entities
  linkEntity: Temporal extends true ? Entity<Temporal>[] : Entity<Temporal>;
  rightEntity: Temporal extends true ? Entity<Temporal>[] : Entity<Temporal>;
};

export type CreateEntityData = {
  entityTypeId: VersionedUrl;
  properties: EntityPropertiesObject;
  linkData?: LinkData;
};

export type GetEntityData<Temporal extends boolean> = {
  entityId: EntityId;
  graphResolveDepths?: Partial<GraphResolveDepths>;
} & (Temporal extends true
  ? { temporalAxes: QueryTemporalAxesUnresolved }
  : { temporalAxes?: never });

export type UpdateEntityData = {
  entityId: EntityId;
  entityTypeId: VersionedUrl;
  properties: EntityPropertiesObject;
} & Pick<LinkData, "leftToRightOrder" | "rightToLeftOrder">;

export type DeleteEntityData = {
  entityId: EntityId;
};

export type FilterOperatorType =
  | FilterOperatorRequiringValue
  | FilterOperatorWithoutValue;

export type FilterOperatorWithoutValue = "IS_DEFINED" | "IS_NOT_DEFINED";

export type FilterOperatorRequiringValue =
  | "CONTAINS_SEGMENT"
  | "DOES_NOT_CONTAIN_SEGMENT"
  | "EQUALS"
  | "DOES_NOT_EQUAL"
  | "STARTS_WITH"
  | "ENDS_WITH";

export type MultiFilterOperatorType = "AND" | "OR";

export type MultiFilter = {
  filters: (
    | {
        field: (string | number)[];
        operator: FilterOperatorRequiringValue;
        value: CoreJsonValue;
      }
    | { field: (string | number)[]; operator: FilterOperatorWithoutValue }
  )[];
  operator: MultiFilterOperatorType;
};

export type Sort = {
  field: (string | number)[];
  desc?: boolean | undefined | null;
};

export type MultiSort = Sort[];

export type QueryOperationInput = {
  multiSort?: MultiSort | null;
  multiFilter?: MultiFilter | null;
};

export type QueryEntitiesData<Temporal extends boolean> = {
  operation: QueryOperationInput;
  graphResolveDepths?: Partial<GraphResolveDepths>;
} & (Temporal extends true
  ? { temporalAxes: QueryTemporalAxesUnresolved }
  : { temporalAxes?: never });

export type QueryEntitiesResult<
  Temporal extends boolean,
  T extends Subgraph<Temporal, EntityRootType<Temporal>>,
> = {
  results: T;
  operation: QueryOperationInput;
};

/**
 * A utility type that extracts the last segment of a string delimited by a separator
 */
type BeforeTrailingLast<
  CurrentString extends string,
  Separator extends string,
  PreviouslyExtractedSegment extends string = never,
> = CurrentString extends `${string}${Separator}${infer Segment}${Separator}`
  ? BeforeTrailingLast<`${Segment}${Separator}`, Separator, Segment>
  : PreviouslyExtractedSegment;

/**
 * A properties object where the URL keys have been replaced by the last segment of the URL
 * To experiment with in block building – might be useful in patterns to make block building easier.
 * @todo remove this if we settle on a pattern that doesn't benefit from it
 */
export type SimpleProperties<Properties extends EntityPropertiesObject> = {
  [Key in keyof Properties as BeforeTrailingLast<
    Extract<Key, string>,
    "/"
  >]: Properties[Key];
};
