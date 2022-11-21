import { PropertyType, PropertyValues } from "@blockprotocol/type-system-web";
import {
  getPersistedDataType,
  Subgraph,
} from "../../../../../../../../../lib/subgraph";

const getDataTypeTitle = (
  dataTypeReference: PropertyValues.DataTypeReference,
  subgraph: Subgraph,
) => {
  const dataTypeId = dataTypeReference.$ref;
  const persistedDataType = getPersistedDataType(subgraph, dataTypeId);

  return persistedDataType?.inner.title ?? "undefined";
};

const getReferencedTypeTitles = (
  propertyValues: PropertyValues[],
  subgraph: Subgraph,
) => {
  const types: string[] = [];

  for (const value of propertyValues) {
    if ("$ref" in value) {
      types.push(getDataTypeTitle(value, subgraph));
    }
  }

  return types;
};

const isArrayOfPropertyValues = (
  propertyValue: PropertyValues,
): propertyValue is PropertyValues.ArrayOfPropertyValues => {
  return "type" in propertyValue && propertyValue.type === "array";
};

export const getDataTypesOfPropertyType = (
  propertyType: PropertyType,
  subgraph: Subgraph,
) => {
  let isArray = false;
  let dataTypes: string[] = [];

  const firstType = propertyType.oneOf[0];

  if (!firstType) {
    throw new Error("There is no type in this property");
  }

  if (isArrayOfPropertyValues(firstType)) {
    isArray = true;
    dataTypes = getReferencedTypeTitles(firstType.items.oneOf, subgraph);
  } else {
    dataTypes = getReferencedTypeTitles(propertyType.oneOf, subgraph);
  }

  return {
    isArray,
    dataTypes,
  };
};
