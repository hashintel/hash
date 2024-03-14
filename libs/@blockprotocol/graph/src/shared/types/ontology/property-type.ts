import type {
  PropertyType,
  VersionedUrl,
} from "@blockprotocol/type-system/slim";

import type { QueryOperationInput } from "../entity.js";
import type { PropertyTypeRootType, Subgraph } from "../subgraph.js";
import type { OntologyElementMetadata } from "./metadata.js";

export type PropertyTypeWithMetadata = {
  schema: PropertyType;
  metadata: OntologyElementMetadata;
};

export type QueryPropertyTypesData = {
  graphResolveDepths?: Partial<
    Pick<
      Subgraph<true>["depths"],
      "constrainsValuesOn" | "constrainsPropertiesOn"
    >
  >;
};

export type QueryPropertyTypesResult<
  T extends Subgraph<boolean, PropertyTypeRootType>,
> = {
  results: T[];
  operation: QueryOperationInput;
};

export type GetPropertyTypeData = {
  propertyTypeId: VersionedUrl;
};

type SystemDefinedPropertyTypeProperties = "$schema" | "$id" | "kind";

export type CreatePropertyTypeData = {
  propertyType: Omit<PropertyType, SystemDefinedPropertyTypeProperties>;
};

export type UpdatePropertyTypeData = {
  propertyTypeId: VersionedUrl;
  propertyType: Omit<PropertyType, SystemDefinedPropertyTypeProperties>;
};
