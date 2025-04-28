import type {
  BaseUrl,
  ClosedDataType,
  ClosedEntityType,
  ConversionDefinition,
  Conversions,
  DataType,
  DataTypeMetadata,
  EntityType,
  EntityTypeMetadata,
  OntologyProvenance,
  OntologyTemporalMetadata,
  OntologyTypeRecordId,
  PartialEntityType,
  PropertyType,
  PropertyTypeMetadata,
  Timestamp,
  VersionedUrl,
  WebId,
} from "@blockprotocol/type-system";
import type { DistributiveOmit } from "@local/advanced-types/distribute";
import type { Subtype } from "@local/advanced-types/subtype";
import type {
  ClosedMultiEntityTypeMap,
  DataTypeConversionTargets as GraphApiDataTypeConversionTargets,
  EntityTypeResolveDefinitions as EntityTypeResolveDefinitionsGraphApi,
  GetClosedMultiEntityTypesResponseDefinitions,
} from "@local/hash-graph-client";

export type OwnedOntologyElementMetadata = {
  recordId: OntologyTypeRecordId;
  provenance: OntologyProvenance;
  temporalVersioning: OntologyTemporalMetadata;
  webId: WebId;
};

export type ExternalOntologyElementMetadata = {
  recordId: OntologyTypeRecordId;
  provenance: OntologyProvenance;
  temporalVersioning: OntologyTemporalMetadata;
  fetchedAt: Timestamp;
};

export type OntologyElementMetadata =
  | DataTypeMetadata
  | PropertyTypeMetadata
  | EntityTypeMetadata;

export type SystemDefinedProperties = "$schema" | "kind" | "$id";

export type ConstructDataTypeParams = DistributiveOmit<
  DataType,
  SystemDefinedProperties
>;

export type ConstructPropertyTypeParams = Omit<
  PropertyType,
  SystemDefinedProperties
>;

export type ConstructEntityTypeParams = Omit<
  EntityType,
  SystemDefinedProperties
>;

export type DataTypeConversionTargets = Omit<
  GraphApiDataTypeConversionTargets,
  "conversions"
> & {
  conversions: ConversionDefinition[];
};

/**
 * A map from a dataTypeId, to a map of target dataTypeIds, to conversion definitions.
 * This is ALL the possible conversion targets of a data type, derived from the ones it directly has a conversion defined to in its record,
 * as well as any onward conversions that are possible (i.e. because a direct target can be converted to something else).
 *
 * Each conversion definition contains (1) the target data type `title`, and (2) the `conversions`: steps required to convert to the target dataTypeId.
 */
export type DataTypeFullConversionTargetsMap = Record<
  VersionedUrl,
  Record<VersionedUrl, DataTypeConversionTargets>
>;

/**
 * The conversions that are directly defined for a data type, and stored in its record.
 *
 * This does not represent all the data types a data type is convertible to, as it may be transitively convertible to others via one of its targets.
 */
export type DataTypeDirectConversionsMap = Record<BaseUrl, Conversions>;

export type ClosedEntityTypeWithMetadata = {
  schema: ClosedEntityType;
  metadata: EntityTypeMetadata;
};

export type ClosedMultiEntityTypesRootMap = {
  [key: string]: ClosedMultiEntityTypeMap;
};

export interface ClosedDataTypeDefinition {
  schema: ClosedDataType;
  parents: VersionedUrl[];
}

export type ClosedMultiEntityTypesDefinitions = Subtype<
  GetClosedMultiEntityTypesResponseDefinitions,
  {
    dataTypes: { [key: VersionedUrl]: ClosedDataTypeDefinition };
    entityTypes: { [key: VersionedUrl]: PartialEntityType };
    propertyTypes: { [key: VersionedUrl]: PropertyType };
  }
>;

export type EntityTypeResolveDefinitions = Subtype<
  EntityTypeResolveDefinitionsGraphApi,
  {
    dataTypes: Record<VersionedUrl, ClosedDataTypeDefinition>;
    propertyTypes: Record<VersionedUrl, PropertyType>;
    entityTypes: Record<VersionedUrl, PartialEntityType>;
  }
>;
