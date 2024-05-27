import type {
  DataTypeWithMetadata as DataTypeWithMetadataBp,
  EntityTypeWithMetadata as EntityTypeWithMetadataBp,
  OntologyElementMetadata as OntologyElementMetadataBp,
  PropertyTypeWithMetadata as PropertyTypeWithMetadataBp,
} from "@blockprotocol/graph/temporal";
import type {
  BaseUrl as BaseUrlBp,
  DataType,
  EntityType,
  PropertyType,
  VersionedUrl,
} from "@blockprotocol/type-system/slim";
import type { Brand } from "@local/advanced-types/brand";
import type { DistributiveOmit } from "@local/advanced-types/distribute";
import type { Subtype } from "@local/advanced-types/subtype";
import type {
  ActorType,
  ProvidedEntityEditionProvenanceOrigin,
  SourceProvenance,
} from "@local/hash-graph-client";
import type { OntologyTypeRecordId } from "@local/hash-subgraph";

import type { EditionArchivedById, EditionCreatedById } from "./account";
import type {
  ExclusiveLimitedTemporalBound,
  InclusiveLimitedTemporalBound,
  TimeInterval,
  Timestamp,
  Unbounded,
} from "./temporal-versioning";
import type { OwnedById } from "./web";

export type BaseUrl = Brand<BaseUrlBp, "BaseUrl">;

export type OntologyProvenance = {
  edition: OntologyEditionProvenance;
};

export type OntologyEditionProvenance = {
  createdById: EditionCreatedById;
  archivedById?: EditionArchivedById;
  actorType?: ActorType;
  origin?: ProvidedEntityEditionProvenanceOrigin;
  sources?: Array<SourceProvenance>;
};

/** @todo-0.3 - Consider redefining `EntityType` and `PropertyType` to use the branded `BaseUrl`s inside them */

export type OwnedOntologyElementMetadata = {
  recordId: OntologyTypeRecordId;
  ownedById: OwnedById;
  provenance: OntologyProvenance;
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
  provenance: OntologyProvenance;
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

export const isExternalOntologyElementMetadata = (
  metadata: DataTypeMetadata | EntityTypeMetadata,
): metadata is ExternalOntologyElementMetadata => "fetchedAt" in metadata;

export const isOwnedOntologyElementMetadata = (
  metadata: DataTypeMetadata | EntityTypeMetadata,
): metadata is OwnedOntologyElementMetadata => "ownedById" in metadata;

export type DataTypeMetadata = OntologyElementMetadata;

export type PropertyTypeMetadata = OntologyElementMetadata;

export type EditableOntologyElementMetadata = Pick<
  EntityTypeWithMetadataBp["metadata"],
  "icon"
> & {
  labelProperty?: BaseUrl | null;
};
export type EntityTypeMetadata = EditableOntologyElementMetadata &
  OntologyElementMetadata;

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
