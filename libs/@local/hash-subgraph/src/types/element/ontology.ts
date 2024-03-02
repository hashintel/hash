import type {
  DataTypeWithMetadata as DataTypeWithMetadataBp,
  EntityTypeWithMetadata as EntityTypeWithMetadataBp,
  type OntologyElementMetadata as OntologyElementMetadataBp,
  PropertyTypeWithMetadata as PropertyTypeWithMetadataBp,
} from "@blockprotocol/graph/temporal";
import type {
  EntityType,
  PropertyType,
  VersionedUrl,
} from "@blockprotocol/type-system/slim";
import { validateBaseUrl } from "@blockprotocol/type-system/slim";
import type { Brand } from "@local/advanced-types/brand";
import type { DistributiveOmit } from "@local/advanced-types/distribute";
import type { Subtype } from "@local/advanced-types/subtype";
import type { DataType } from "@local/hash-graph-client";

import type {
  BaseUrl,
  ExclusiveLimitedTemporalBound,
  InclusiveLimitedTemporalBound,
  OntologyProvenanceMetadata,
  OwnedById,
  TimeInterval,
  Timestamp,
  Unbounded,
} from "../shared";

/**
 * The second component of the [{@link BaseUrl}, RevisionId] tuple needed to identify a specific ontology type vertex
 * within a {@link Subgraph}. This should be the version number as a string.
 */
export type OntologyTypeRevisionId = Brand<
  `${number}`,
  "OntologyTypeRevisionId"
>;

export type OntologyTypeRecordId = {
  baseUrl: BaseUrl;
  version: number;
};

export const ontologyTypeRecordIdToVersionedUrl = (
  ontologyTypeRecordId: OntologyTypeRecordId,
): VersionedUrl => {
  return `${ontologyTypeRecordId.baseUrl}v/${ontologyTypeRecordId.version}`;
};

export const isOntologyTypeRecordId = (
  editionId: object,
): editionId is OntologyTypeRecordId => {
  return (
    "baseId" in editionId &&
    typeof editionId.baseId === "string" &&
    validateBaseUrl(editionId.baseId).type !== "Err" &&
    "version" in editionId &&
    typeof editionId.version === "number" &&
    Number.isInteger(editionId.version)
  );
};

/** @todo-0.3 - Consider redefining `EntityType` and `PropertyType` to use the branded `BaseUrl`s inside them */

export type OwnedOntologyElementMetadata = {
  recordId: OntologyTypeRecordId;
  ownedById: OwnedById;
  provenance: OntologyProvenanceMetadata;
  temporalVersioning: {
    transactionTime: TimeInterval<
      InclusiveLimitedTemporalBound,
      ExclusiveLimitedTemporalBound | Unbounded
    >;
  };
};

export type ExternalOntologyElementMetadata = {
  recordId: OntologyTypeRecordId;
  fetchedAt: Timestamp;
  provenance: OntologyProvenanceMetadata;
  temporalVersioning: {
    transactionTime: TimeInterval<
      InclusiveLimitedTemporalBound,
      ExclusiveLimitedTemporalBound | Unbounded
    >;
  };
};

type OntologyElementMetadata = Subtype<
  OntologyElementMetadataBp,
  OwnedOntologyElementMetadata | ExternalOntologyElementMetadata
>;

export type EditableOntologyElementMetadata = Pick<
  EntityTypeWithMetadataBp["metadata"],
  "icon"
> & {
  labelProperty?: BaseUrl | null;
};

export type DataTypeMetadata = OntologyElementMetadata;

export type PropertyTypeMetadata = OntologyElementMetadata;

export type EntityTypeMetadata = EditableOntologyElementMetadata &
  OntologyElementMetadata;

/**
 * Non-exhaustive list of possible values for 'format'
 *
 * The presence of a format in this list does _NOT_ mean that:
 * 1. The Graph will validate it
 * 2. The frontend will treat it differently for input or display
 *
 * @see https://json-schema.org/understanding-json-schema/reference/string
 */
type StringFormat =
  | "date"
  | "time"
  | "date-time"
  | "duration"
  | "email"
  | "hostname"
  | "ipv4"
  | "ipv6"
  | "regex"
  | "uri"
  | "uuid";

export type StringConstraint = {
  format?: StringFormat;
  minLength?: number; // Int
  maxLength?: number; // Int
  pattern?: string; // RegExp
  type: "string";
};

export type NumberConstraint = {
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  multipleOf?: number;
  type: "number" | "integer";
};

export type BooleanConstraint = {
  type: "boolean";
};

export type NullConstraint = {
  type: "null";
};

export type ObjectConstraint = {
  type: "object";
};

export type StringEnumConstraint = {
  enum: string[];
  type: "string";
};

export type NumberEnumConstraint = {
  enum: number[];
  type: "number" | "integer";
};

/** @see https://json-schema.org/understanding-json-schema/reference/enum */
export type EnumConstraint = StringEnumConstraint | NumberEnumConstraint;

export type StringConstConstraint = {
  const: string;
  type: "string";
};

export type NumberConstConstraint = {
  const: number;
  type: "number" | "integer";
};

export type ConstConstraint = StringConstConstraint | NumberConstConstraint;

type ValueLabel = {
  left?: string;
  right?: string;
};

export type SingleValueConstraint =
  | BooleanConstraint
  | NullConstraint
  | ObjectConstraint
  | StringConstraint
  | NumberConstraint
  | EnumConstraint
  | ConstConstraint;

export type ArrayConstraint = {
  type: "array";
  items: ValueConstraint;
};

/** @see https://json-schema.org/understanding-json-schema/reference/array#tuple-validation */
export type TupleConstraint = {
  type: "array";
  items: false; // disallow additional items;
  prefixItems: ValueConstraint[];
};

export type ValueConstraint = (
  | SingleValueConstraint
  | ArrayConstraint
  | TupleConstraint
) & { description?: string; label?: ValueLabel };

export type CustomDataType = Subtype<
  DataType,
  {
    description?: string;
    $id: VersionedUrl;
    kind: "dataType";
    $schema: "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type";
    title: string;
  } & ValueConstraint
>;

export type ConstructDataTypeParams = DistributiveOmit<
  CustomDataType,
  "$id" | "kind" | "$schema"
>;

export type DataTypeWithMetadata = Subtype<
  DataTypeWithMetadataBp,
  {
    schema: CustomDataType;
    metadata: OntologyElementMetadata;
  }
>;

export type PropertyTypeWithMetadata = Subtype<
  PropertyTypeWithMetadataBp,
  {
    schema: PropertyType;
    metadata: OntologyElementMetadata;
  }
>;

export type EntityTypeWithMetadata = Subtype<
  EntityTypeWithMetadataBp,
  {
    schema: EntityType;
    metadata: EntityTypeMetadata;
  }
>;

export const isExternalOntologyElementMetadata = (
  metadata: DataTypeMetadata | EntityTypeMetadata,
): metadata is ExternalOntologyElementMetadata => "fetchedAt" in metadata;

export const isOwnedOntologyElementMetadata = (
  metadata: DataTypeMetadata | EntityTypeMetadata,
): metadata is OwnedOntologyElementMetadata => "ownedById" in metadata;
