import {
  DataTypeReference,
  PropertyType,
  PropertyValues,
} from "@blockprotocol/type-system";
import { getDataTypeById } from "@local/hash-subgraph/src/stdlib/element/data-type";
import { Subgraph } from "@local/hash-types";

import { isPropertyValueArray } from "../../../../../../../../../lib/typeguards";

const getDataTypeTitle = (
  dataTypeReference: DataTypeReference,
  subgraph: Subgraph,
) => {
  const dataTypeId = dataTypeReference.$ref;
  const dataType = getDataTypeById(subgraph, dataTypeId);

  return dataType?.schema.title ?? "undefined";
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

export const getExpectedTypesOfPropertyType = (
  propertyType: PropertyType,
  subgraph: Subgraph,
) => {
  let isArray = false;
  let expectedTypes: string[] = [];

  const firstType = propertyType.oneOf[0];

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- improve logic or types to remove this comment
  if (!firstType) {
    throw new Error("There is no type in this property");
  }

  if (isPropertyValueArray(firstType)) {
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
