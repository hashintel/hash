import type {
  DataTypeWithMetadata as DataTypeWithMetadataBp,
  EntityTypeWithMetadata as EntityTypeWithMetadataBp,
  OntologyElementMetadata as OntologyElementMetadataBp,
  PropertyTypeWithMetadata as PropertyTypeWithMetadataBp,
} from "@blockprotocol/graph";
import type {
  PropertyTypeReference,
  ValueOrArray,
} from "@blockprotocol/type-system";
import { validateBaseUrl } from "@blockprotocol/type-system";
import type {
  BaseUrl as BaseUrlBp,
  ClosedDataType,
  ClosedEntityType as ClosedEntityTypeBp,
  ClosedEntityTypeMetadata as ClosedEntityTypeMetadataBp,
  ClosedMultiEntityType as ClosedMultiEntityTypeBp,
  ConversionDefinition,
  DataType,
  EntityType,
  EntityTypeDisplayMetadata as EntityTypeDisplayMetadataBp,
  PartialEntityType as PartialEntityTypeBp,
  PropertyType,
  VersionedUrl,
} from "@blockprotocol/type-system/slim";
import type { Brand } from "@local/advanced-types/brand";
import type { DistributiveOmit } from "@local/advanced-types/distribute";
import type { Subtype } from "@local/advanced-types/subtype";
import type {
  ActorType,
  ClosedMultiEntityTypeMap,
  EntityTypeResolveDefinitions as EntityTypeResolveDefinitionsGraphApi,
  GetClosedMultiEntityTypeResponseDefinitions,
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

export type OntologyElementMetadata = Subtype<
  OntologyElementMetadataBp,
  OwnedOntologyElementMetadata | ExternalOntologyElementMetadata
>;

export type ConstructDataTypeParams = DistributiveOmit<
  DataType,
  "$id" | "kind" | "$schema"
>;

export type DataTypeMetadata = OntologyElementMetadata;
export type PropertyTypeMetadata = OntologyElementMetadata;
export type EntityTypeMetadata = OntologyElementMetadata;

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

export type EntityTypeDisplayMetadata = Omit<
  EntityTypeDisplayMetadataBp,
  "labelProperty"
> & {
  labelProperty?: BaseUrl;
};

export type ClosedEntityType = Omit<
  ClosedEntityTypeBp,
  "properties" | "required" | "allOf"
> & {
  allOf?: [EntityTypeDisplayMetadata, ...EntityTypeDisplayMetadata[]];
  properties: Record<BaseUrl, ValueOrArray<PropertyTypeReference>>;
  required?: [BaseUrl, ...BaseUrl[]];
};

export type ClosedEntityTypeWithMetadata = {
  schema: ClosedEntityType;
  metadata: EntityTypeMetadata;
};

export type ClosedMultiEntityTypeMetadata = Omit<
  ClosedEntityTypeMetadataBp,
  "allOf"
> & {
  allOf?: [EntityTypeDisplayMetadata, ...EntityTypeDisplayMetadata[]];
};

export type ClosedMultiEntityType = Omit<
  ClosedMultiEntityTypeBp,
  "allOf" | "properties" | "required"
> & {
  allOf: [ClosedMultiEntityTypeMetadata, ...ClosedMultiEntityTypeMetadata[]];
  properties: Record<BaseUrl, ValueOrArray<PropertyTypeReference>>;
  required?: [BaseUrl, ...BaseUrl[]];
};

export type ClosedMultiEntityTypesRootMap = {
  [key: string]: ClosedMultiEntityTypeMap;
};

export interface ClosedDataTypeDefinition {
  schema: ClosedDataType;
  parents: VersionedUrl[];
}

export type ClosedMultiEntityTypesDefinitions = Subtype<
  GetClosedMultiEntityTypeResponseDefinitions,
  {
    dataTypes: { [key: VersionedUrl]: ClosedDataTypeDefinition };
    entityTypes: { [key: VersionedUrl]: PartialEntityType };
    propertyTypes: { [key: VersionedUrl]: PropertyType };
  }
>;

export type PartialEntityType = Omit<PartialEntityTypeBp, "labelProperty"> & {
  labelProperty: BaseUrl;
};

export type EntityTypeResolveDefinitions = Subtype<
  EntityTypeResolveDefinitionsGraphApi,
  {
    dataTypes: Record<VersionedUrl, ClosedDataTypeDefinition>;
    propertyTypes: Record<VersionedUrl, PropertyType>;
    entityTypes: Record<VersionedUrl, PartialEntityType>;
  }
>;
