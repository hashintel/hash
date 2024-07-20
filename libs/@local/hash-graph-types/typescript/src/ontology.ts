import type {
  DataTypeWithMetadata as DataTypeWithMetadataBp,
  EntityTypeWithMetadata as EntityTypeWithMetadataBp,
  OntologyElementMetadata as OntologyElementMetadataBp,
  PropertyTypeWithMetadata as PropertyTypeWithMetadataBp,
} from "@blockprotocol/graph";
import { validateBaseUrl } from "@blockprotocol/type-system";
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

import type { EditionArchivedById, EditionCreatedById } from "./account.js";
import type {
  ExclusiveLimitedTemporalBound,
  InclusiveLimitedTemporalBound,
  TimeInterval,
  Timestamp,
  Unbounded,
} from "./temporal-versioning.js";
import type { OwnedById } from "./web.js";

export type BaseUrl = Brand<BaseUrlBp, "BaseUrl">;

export const isBaseUrl = (baseUrl: string): baseUrl is BaseUrl => {
  return validateBaseUrl(baseUrl).type === "Ok";
};

export interface OntologyProvenance {
  edition: OntologyEditionProvenance;
}

export interface OntologyEditionProvenance {
  createdById: EditionCreatedById;
  archivedById?: EditionArchivedById;
  actorType?: ActorType;
  origin?: ProvidedEntityEditionProvenanceOrigin;
  sources?: SourceProvenance[];
}

export interface OntologyTypeRecordId {
  baseUrl: BaseUrl;
  version: number;
}

/** @todo-0.3 - Consider redefining `EntityType` and `PropertyType` to use the branded `BaseUrl`s inside them */

export interface OwnedOntologyElementMetadata {
  recordId: OntologyTypeRecordId;
  ownedById: OwnedById;
  provenance: OntologyProvenance;
  temporalVersioning: {
    transactionTime: TimeInterval<
      InclusiveLimitedTemporalBound,
      ExclusiveLimitedTemporalBound | Unbounded
    >;
  };
}

export interface ExternalOntologyElementMetadata {
  recordId: OntologyTypeRecordId;
  fetchedAt: Timestamp;
  provenance: OntologyProvenance;
  temporalVersioning: {
    transactionTime: TimeInterval<
      InclusiveLimitedTemporalBound,
      ExclusiveLimitedTemporalBound | Unbounded
    >;
  };
}

type OntologyElementMetadata = Subtype<
  OntologyElementMetadataBp,
  OwnedOntologyElementMetadata | ExternalOntologyElementMetadata
>;

/**
 * Non-exhaustive list of possible values for 'format'.
 *
 * The presence of a format in this list does _NOT_ mean that:
 * 1. The Graph will validate it
 * 2. The frontend will treat it differently for input or display.
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

export interface StringConstraint {
  format?: StringFormat;
  minLength?: number; // Int
  maxLength?: number; // Int
  pattern?: string; // RegExp
  type: "string";
}

export interface NumberConstraint {
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: boolean;
  exclusiveMaximum?: boolean;
  multipleOf?: number;
  type: "number" | "integer";
}

export interface BooleanConstraint {
  type: "boolean";
}

export interface NullConstraint {
  type: "null";
}

export interface ObjectConstraint {
  type: "object";
}

export interface StringEnumConstraint {
  enum: [string, ...string[]];
  type: "string";
}

export interface NumberEnumConstraint {
  enum: [number, ...number[]];
  type: "number" | "integer";
}

/** @see https://json-schema.org/understanding-json-schema/reference/enum */
export type EnumConstraint = StringEnumConstraint | NumberEnumConstraint;

export interface StringConstConstraint {
  const: string;
  type: "string";
}

export interface NumberConstConstraint {
  const: number;
  type: "number" | "integer";
}

export type ConstConstraint = StringConstConstraint | NumberConstConstraint;

interface ValueLabel {
  left?: string;
  right?: string;
}

export type SingleValueConstraint =
  | BooleanConstraint
  | NullConstraint
  | ObjectConstraint
  | StringConstraint
  | NumberConstraint
  | EnumConstraint
  | ConstConstraint;

export interface ArrayConstraint {
  type: "array";
  items: ValueConstraint;
}

/** @see https://json-schema.org/understanding-json-schema/reference/array#tuple-validation */
export interface TupleConstraint {
  type: "array";
  items: false; // disallow additional items;
  prefixItems: ValueConstraint[];
}

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
