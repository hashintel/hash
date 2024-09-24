import type {
  DataTypeWithMetadata as DataTypeWithMetadataBp,
  EntityTypeWithMetadata as EntityTypeWithMetadataBp,
  OntologyElementMetadata as OntologyElementMetadataBp,
  PropertyTypeWithMetadata as PropertyTypeWithMetadataBp,
} from "@blockprotocol/graph";
import type {
  ArraySchema,
  BooleanSchema,
  DataTypeLabel,
  NullSchema,
  NumberSchema,
  ObjectSchema,
  StringFormat,
  StringSchema,
} from "@blockprotocol/type-system";
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

export type OntologyTypeRecordId = {
  baseUrl: BaseUrl;
  version: number;
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

export type StringConstraint = Subtype<
  StringSchema,
  {
    format?: StringFormat;
    minLength?: number; // Int
    maxLength?: number; // Int
    pattern?: string; // RegExp
    type: "string";
  }
>;

export type NumberConstraint = Subtype<
  NumberSchema,
  {
    minimum?: number;
    maximum?: number;
    exclusiveMinimum?: boolean;
    exclusiveMaximum?: boolean;
    multipleOf?: number;
    type: "number";
  }
>;

export type BooleanConstraint = Subtype<
  BooleanSchema,
  {
    type: "boolean";
  }
>;

export type NullConstraint = Subtype<
  NullSchema,
  {
    type: "null";
  }
>;

export type ObjectConstraint = Subtype<
  ObjectSchema,
  {
    type: "object";
  }
>;

export type StringEnumConstraint = Subtype<
  StringSchema,
  {
    enum: [string, ...string[]];
    type: "string";
  }
>;

export type NumberEnumConstraint = Subtype<
  NumberSchema,
  {
    enum: [number, ...number[]];
    type: "number";
  }
>;

/** @see https://json-schema.org/understanding-json-schema/reference/enum */
export type EnumConstraint = StringEnumConstraint | NumberEnumConstraint;

export type StringConstConstraint = Subtype<
  StringSchema,
  {
    const: string;
    type: "string";
  }
>;

export type NumberConstConstraint = Subtype<
  NumberSchema,
  {
    const: number;
    type: "number";
  }
>;

export type ConstConstraint = StringConstConstraint | NumberConstConstraint;

export type SingleValueConstraint =
  | BooleanConstraint
  | NullConstraint
  | ObjectConstraint
  | StringConstraint
  | NumberConstraint
  | EnumConstraint
  | ConstConstraint;

export type ArrayConstraint = Subtype<
  ArraySchema,
  {
    type: "array";
    items: ValueConstraint;
  }
>;

/** @see https://json-schema.org/understanding-json-schema/reference/array#tuple-validation */
export type TupleConstraint = Subtype<
  ArraySchema,
  {
    type: "array";
    items: false; // disallow additional items;
    prefixItems: [ValueConstraint, ...ValueConstraint[]];
  }
>;

export type ValueConstraint = (
  | SingleValueConstraint
  | ArrayConstraint
  | TupleConstraint
  | { anyOf: [ValueConstraint, ...ValueConstraint[]] }
) & { description?: string; label?: DataTypeLabel };

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
