import type {
  DataTypeReference,
  PropertyType,
  PropertyValues,
} from "@blockprotocol/type-system";
import type {
  ClosedDataTypeDefinition,
  ClosedMultiEntityTypesDefinitions,
} from "@local/hash-graph-sdk/ontology";

import { isPropertyValueArray } from "../../../../../../../../lib/typeguards";

const getDataType = (
  dataTypeReference: DataTypeReference,
  definitions: ClosedMultiEntityTypesDefinitions,
) => {
  const dataTypeId = dataTypeReference.$ref;
  const dataType = definitions.dataTypes[dataTypeId];

  if (!dataType) {
    throw new Error(`Could not find data type with id ${dataTypeId}`);
  }

  return dataType;
};

const getReferencedDataTypes = (
  propertyValues: PropertyValues[],
  definitions: ClosedMultiEntityTypesDefinitions,
) => {
  const types: ClosedDataTypeDefinition[] = [];

  for (const value of propertyValues) {
    if ("$ref" in value) {
      types.push(getDataType(value, definitions));
    }
  }

  return types;
};

export const getExpectedTypesOfPropertyType = (
  propertyType: PropertyType,
  definitions: ClosedMultiEntityTypesDefinitions,
): {
  expectedTypes: ClosedDataTypeDefinition[];
  isArray: boolean;
} => {
  let isArray = false;
  let expectedTypes: ClosedDataTypeDefinition[] = [];

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
    expectedTypes = getReferencedDataTypes(firstType.items.oneOf, definitions);
  } else {
    expectedTypes = getReferencedDataTypes(propertyType.oneOf, definitions);
  }

  return {
    isArray,
    expectedTypes,
  };
};
