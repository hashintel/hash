import type {
  DataTypeReference,
  PropertyType,
  PropertyValues,
} from "@blockprotocol/type-system";
import type { DataTypeWithMetadata, Subgraph } from "@local/hash-subgraph";
import { getDataTypeById } from "@local/hash-subgraph/stdlib";

import { isPropertyValueArray } from "../../../../../../../../../lib/typeguards";

const getDataType = (
  dataTypeReference: DataTypeReference,
  subgraph: Subgraph,
) => {
  const dataTypeId = dataTypeReference.$ref;
  const dataType = getDataTypeById(subgraph, dataTypeId);

  if (!dataType) {
    throw new Error(`Could not find data type with id ${dataTypeId}`);
  }

  return dataType.schema;
};

const getReferencedDataTypes = (
  propertyValues: PropertyValues[],
  subgraph: Subgraph,
) => {
  const types: DataTypeWithMetadata["schema"][] = [];

  for (const value of propertyValues) {
    if ("$ref" in value) {
      types.push(getDataType(value, subgraph));
    }
  }

  return types;
};

export const getExpectedTypesOfPropertyType = (
  propertyType: PropertyType,
  subgraph: Subgraph,
): {
  expectedTypes: DataTypeWithMetadata["schema"][];
  isArray: boolean;
} => {
  let isArray = false;
  let expectedTypes: DataTypeWithMetadata["schema"][] = [];

  /**
   * @todo handle property types with multiple expected values -- H-2257
   * e.g. the Paragraph block expects either 'string' or 'object[]'
   * The entity editor input currently can only handle either different single values, or a mixed array – not single value or array
   */
  const firstType = propertyType.oneOf[0];

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- improve logic or types to remove this comment
  if (!firstType) {
    throw new Error("There is no type in this property");
  }

  if (isPropertyValueArray(firstType)) {
    isArray = true;
    expectedTypes = getReferencedDataTypes(firstType.items.oneOf, subgraph);
  } else {
    expectedTypes = getReferencedDataTypes(propertyType.oneOf, subgraph);
  }

  return {
    isArray,
    expectedTypes,
  };
};
