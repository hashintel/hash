import type {
  EntityMetadata as EntityMetadataBp,
  EntityRecordId as EntityRecordIdBp,
  EntityTemporalVersioningMetadata as EntityTemporalVersioningMetadataBp,
  LinkData as LinkDataBp,
} from "@blockprotocol/graph";
import type { VersionedUrl } from "@blockprotocol/type-system";
import type { Brand } from "@local/advanced-types/brand";
import type { Subtype } from "@local/advanced-types/subtype";
import type {
  ArrayMetadata,
  EntityEditionProvenance as EntityEditionProvenanceGraphApi,
  ObjectMetadata,
  ValueMetadata,
} from "@local/hash-graph-client";

import type {
  CreatedById,
  EditionArchivedById,
  EditionCreatedById,
} from "./account.js";
import type { Uuid } from "./branded.js";
import type { BaseUrl } from "./ontology.js";
import type {
  CreatedAtDecisionTime,
  CreatedAtTransactionTime,
  ExclusiveLimitedTemporalBound,
  InclusiveLimitedTemporalBound,
  TemporalAxis,
  TimeInterval,
  Unbounded,
} from "./temporal-versioning.js";
import type { OwnedById } from "./web.js";

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

export type EntityMetadata<
  EntityTypeIds extends [VersionedUrl, ...VersionedUrl[]] = [
    VersionedUrl,
    ...VersionedUrl[],
  ],
> = Subtype<
  EntityMetadataBp,
  {
    recordId: EntityRecordId;
    entityTypeIds: EntityTypeIds;
    temporalVersioning: EntityTemporalVersioningMetadata;
    archived: boolean;
    properties?: PropertyMetadataObject;
    provenance: EntityProvenance;
  }
>;

/**
 * The value of a property.
 *
 * Inside a property, a `Value` is the leaf node of the property tree.
 */
export type PropertyValue =
  | null
  | boolean
  | number
  | string
  | PropertyValue[]
  | { [key: string]: PropertyValue };

/**
 * A list of properties.
 */
export type PropertyArray = Property[];

/**
 * A mapping of property base URLs to their values.
 */
export type PropertyObject = {
  [key: BaseUrl]: Property;
};

/**
 * Takes a property object which has unbranded string keys, such as those found in the generated system types
 * in @local/hash-isomorphic-utils/system-types/*, and returns an object where the keys are branded as BaseUrls.
 *
 * Useful when wanting to strongly type a property object and pass it to a function that expends an object with branded keys.
 *
 * @todo consider updating the system type TS generation code to brand the keys automatically
 */
export type BrandedPropertyObject<T extends Record<string, PropertyValue>> =
  T & {
    [K in keyof T as Brand<K & string, "BaseUrl">]: T[K];
  };

// Helper function to create branded objects
export const brandPropertyObject = <T extends Record<string, PropertyValue>>(
  obj: T,
): BrandedPropertyObject<T> => {
  return obj as BrandedPropertyObject<T>;
};

export type EntityProperties = {
  entityTypeIds: [VersionedUrl, ...VersionedUrl[]];
  properties: PropertyObject;
  propertiesWithMetadata: PropertyObjectWithMetadata;
};

/**
 * A property is a tree structure that represents a property of an entity.
 *
 * In many cases, this will be a simple value, but it can also be an object or
 * an array with various nested properties.
 *
 * With only a `Property` provided it's impossible to distinguish between
 * a `Value` and an `Object` or `Array`. For this, the metadata is required.
 */
export type Property = PropertyValue | PropertyArray | PropertyObject;

/**
 * The metadata for a `PropertyValue`.
 */
export type PropertyMetadataValue = {
  metadata: Omit<ValueMetadata, "dataTypeId" | "canonical"> & {
    dataTypeId: VersionedUrl | null;
  };
};

/**
 * The metadata for a `PropertyArray`.
 *
 * It contains metadata for the array itself and for each of its elements.
 */
export type PropertyMetadataArray = {
  value: PropertyMetadata[];
  metadata?: ArrayMetadata;
};

/**
 * The metadata for a `PropertyObject`.
 *
 * It contains metadata for the object itself and for each of its properties.
 */
export type PropertyMetadataObject = {
  value: {
    [key: BaseUrl]: PropertyMetadata;
  };
  metadata?: ObjectMetadata;
};

export type PropertyMetadata =
  | PropertyMetadataArray
  | PropertyMetadataObject
  | PropertyMetadataValue;

export const isValueMetadata = (
  metadata: PropertyMetadata,
): metadata is PropertyMetadataValue =>
  !!metadata.metadata && "dataTypeId" in metadata.metadata;

export const isArrayMetadata = (
  metadata: PropertyMetadata,
): metadata is PropertyMetadataArray =>
  !isValueMetadata(metadata) && Array.isArray(metadata.value);

export const isObjectMetadata = (
  metadata: PropertyMetadata,
): metadata is PropertyMetadataObject =>
  !isValueMetadata(metadata) && !Array.isArray(metadata.value);

export type Confidence = number;

/**
 * A compound type that contains both the value and the metadata of a property
 * value.
 *
 * It consists of the `value`, which is the actual property value, and the
 * `metadata` for the value itself.
 */
export interface PropertyValueWithMetadata {
  value: PropertyValue;
  metadata: PropertyMetadataValue["metadata"];
}

/**
 * A compound type that contains both the value and the metadata of a property
 * array.
 *
 * It consists of the `value`, which is the actual property array, and the
 * `metadata` of the array itself.
 */
export interface PropertyArrayWithMetadata {
  value: PropertyWithMetadata[];
  metadata?: PropertyMetadataArray["metadata"];
}

/**
 * A compound type that contains both the value and the metadata of a property
 * object.
 *
 * It consists of the `value`, which is the actual property object, and the
 * `metadata` of the object itself.
 */
export interface PropertyObjectWithMetadata {
  value: Record<BaseUrl, PropertyWithMetadata>;
  metadata?: PropertyMetadataObject["metadata"];
}

/**
 * A compound type that contains both the value and the metadata of a property.
 */
export type PropertyWithMetadata =
  | PropertyArrayWithMetadata
  | PropertyObjectWithMetadata
  | PropertyValueWithMetadata;

export const isValueWithMetadata = (
  metadata: PropertyWithMetadata,
): metadata is PropertyValueWithMetadata =>
  metadata.metadata !== undefined && "dataTypeId" in metadata.metadata;

export const isArrayWithMetadata = (
  metadata: PropertyWithMetadata,
): metadata is PropertyArrayWithMetadata =>
  !isValueMetadata(metadata) && Array.isArray(metadata.value);

export const isObjectWithMetadata = (
  metadata: PropertyWithMetadata,
): metadata is PropertyObjectWithMetadata =>
  !isValueMetadata(metadata) && !Array.isArray(metadata.value);

/**
 * A path to a property in a properties object
 *
 * @example where the 'address' property is an array, the path to the street of the first address
 *    ["https://example.com/address/", 0, "https://example.com/street/"]
 * @example where the 'address' property is not an array, the path to the street of the single address
 *    ["https://example.com/address/", "https://example.com/street/"]
 * @example where the 'color' property is an array of RGB tuples [number, number, number], the green value of the first
 *   color
 *    ["https://example.com/color/", 0, 1]
 */
export type PropertyPath = (BaseUrl | number)[];

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

export type EntityEditionProvenance = Omit<
  EntityEditionProvenanceGraphApi,
  "createdById" | "archivedById"
> & {
  createdById: EditionCreatedById;
  archivedById?: EditionArchivedById;
};

export type AddPropertyPatchOperation = {
  op: "add";
  path: PropertyPath;
  property: PropertyWithMetadata;
};

export type RemovePropertyPatchOperation = {
  op: "remove";
  path: PropertyPath;
};

export type ReplacePropertyPatchOperation = {
  op: "replace";
  path: PropertyPath;
  property: PropertyWithMetadata;
};

export type PropertyPatchOperation =
  | AddPropertyPatchOperation
  | RemovePropertyPatchOperation
  | ReplacePropertyPatchOperation;
