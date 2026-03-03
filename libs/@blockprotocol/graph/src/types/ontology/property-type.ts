import type { PropertyType, VersionedUrl } from "@blockprotocol/type-system";

import type { QueryOperationInput } from "../entity.js";
import type {
  GraphResolveDepths,
  PropertyTypeRootType,
  Subgraph,
} from "../subgraph.js";

export type QueryPropertyTypesData = {
  graphResolveDepths?: Partial<
    Pick<GraphResolveDepths, "constrainsValuesOn" | "constrainsPropertiesOn">
  >;
};

export type QueryPropertyTypesResult<T extends Subgraph<PropertyTypeRootType>> =
  {
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
