import type {
  DataTypeWithMetadata as DataTypeWithMetadataBp,
  EntityTypeWithMetadata as EntityTypeWithMetadataBp,
  OntologyElementMetadata as OntologyElementMetadataBp,
  PropertyTypeWithMetadata as PropertyTypeWithMetadataBp,
} from "@blockprotocol/graph";
import type {
  ArrayConstraints,
  ArraySchema,
  TupleConstraints,
} from "@blockprotocol/type-system";
import { validateBaseUrl } from "@blockprotocol/type-system";
import type {
  BaseUrl as BaseUrlBp,
  DataType,
  EntityType,
  PropertyType,
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

export const isArrayConstraints = (
  schema: ArraySchema,
): schema is ArrayConstraints => {
  // TODO: Remove `"items" in schema` check when `const` is not allowed on arrays
  //   see https://linear.app/hash/issue/H-3368/remove-const-from-array-constraints
  return (
    "items" in schema && schema.items !== undefined && schema.items !== false
  );
};

export const isTupleConstraints = (
  schema: ArraySchema,
): schema is TupleConstraints => {
  // TODO: Remove `"items" in schema` check when `const` is not allowed on arrays
  //   see https://linear.app/hash/issue/H-3368/remove-const-from-array-constraints
  return "items" in schema && schema.items === false;
};

export type ConstructDataTypeParams = DistributiveOmit<
  DataType,
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
    schema: DataType;
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
