import type {
  JsonObject as CoreJsonObject,
  JsonValue as CoreJsonValue,
} from "@blockprotocol/core";
import type { BaseUrl, VersionedUrl } from "@blockprotocol/type-system/slim";

import type {
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
import type { GraphResolveDepths } from "./subgraph/graph-resolve-depths.js";

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

export type EntityMetadata = {
  recordId: EntityRecordId;
  entityTypeIds: VersionedUrl[];
  temporalVersioning: EntityTemporalVersioningMetadata;
};

export type LinkData = {
  leftEntityId: EntityId;
  rightEntityId: EntityId;
};

export type Entity<
  Properties extends EntityPropertiesObject | null = Record<
    BaseUrl,
    EntityPropertyValue
  >,
> = {
  metadata: EntityMetadata;
  linkData?: LinkData;
} & (Properties extends null
  ? { properties?: never }
  : { properties: Properties });

export type LinkEntityAndRightEntity = {
  linkEntity: Entity[];
  rightEntity: Entity[];
};

export type CreateEntityData = {
  entityTypeIds: VersionedUrl[];
  properties: EntityPropertiesObject;
  linkData?: LinkData;
};

export type GetEntityData = {
  entityId: EntityId;
  graphResolveDepths?: Partial<GraphResolveDepths>;
  temporalAxes: QueryTemporalAxesUnresolved;
};

export type UpdateEntityData = {
  entityId: EntityId;
  entityTypeIds: VersionedUrl[];
  properties: EntityPropertiesObject;
};

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

export type QueryEntitiesData = {
  operation: QueryOperationInput;
  graphResolveDepths?: Partial<GraphResolveDepths>;
  temporalAxes: QueryTemporalAxesUnresolved;
};

export type QueryEntitiesResult<T extends Subgraph<EntityRootType>> = {
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
