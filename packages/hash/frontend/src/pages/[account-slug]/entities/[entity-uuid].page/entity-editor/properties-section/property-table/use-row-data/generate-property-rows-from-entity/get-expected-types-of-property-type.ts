import {
  Array,
  DataTypeReference,
  OneOf,
  PropertyType,
  PropertyValues,
} from "@blockprotocol/type-system-web";
import { Subgraph } from "@hashintel/hash-subgraph";
import { getDataTypeById } from "@hashintel/hash-subgraph/src/stdlib/element/data-type";

const getDataTypeTitle = (
  dataTypeReference: DataTypeReference,
  subgraph: Subgraph,
) => {
  const dataTypeId = dataTypeReference.$ref;
  const persistedDataType = getDataTypeById(subgraph, dataTypeId);

  return persistedDataType?.schema.title ?? "undefined";
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
): propertyValue is Array<OneOf<PropertyValues>> => {
  return "type" in propertyValue && propertyValue.type === "array";
};

export const getExpectedTypesOfPropertyType = (
  propertyType: PropertyType,
  subgraph: Subgraph,
) => {
  let isArray = false;
  let expectedTypes: string[] = [];

  const firstType = propertyType.oneOf[0];

  if (!firstType) {
    throw new Error("There is no type in this property");
  }

  if (isArrayOfPropertyValues(firstType)) {
    isArray = true;
    expectedTypes = getReferencedTypeTitles(firstType.items.oneOf, subgraph);
  } else {
    expectedTypes = getReferencedTypeTitles(propertyType.oneOf, subgraph);
  }

  return {
    isArray,
    expectedTypes,
  };
};
