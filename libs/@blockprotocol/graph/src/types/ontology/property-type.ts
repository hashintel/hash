import type {
  PropertyType,
  VersionedUrl,
} from "@blockprotocol/type-system/slim";

import type { QueryOperationInput } from "../entity.js";
import type { PropertyTypeRootType, Subgraph } from "../subgraph.js";

import type { OntologyElementMetadata } from "./metadata.js";

export interface PropertyTypeWithMetadata {
  schema: PropertyType;
  metadata: OntologyElementMetadata;
}

export interface QueryPropertyTypesData {
  graphResolveDepths?: Partial<
    Pick<Subgraph["depths"], "constrainsValuesOn" | "constrainsPropertiesOn">
  >;
}

export interface QueryPropertyTypesResult<T extends Subgraph<PropertyTypeRootType>> {
    results: T[];
    operation: QueryOperationInput;
  }

export interface GetPropertyTypeData {
  propertyTypeId: VersionedUrl;
}

type SystemDefinedPropertyTypeProperties = "$schema" | "$id" | "kind";

export interface CreatePropertyTypeData {
  propertyType: Omit<PropertyType, SystemDefinedPropertyTypeProperties>;
}

export interface UpdatePropertyTypeData {
  propertyTypeId: VersionedUrl;
  propertyType: Omit<PropertyType, SystemDefinedPropertyTypeProperties>;
}
