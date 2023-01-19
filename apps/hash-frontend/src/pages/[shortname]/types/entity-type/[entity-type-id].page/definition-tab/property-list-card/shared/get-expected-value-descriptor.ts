import { types } from "@local/hash-isomorphic-utils/ontology-types";

import { dataTypeOptions } from "./data-type-options";
import {
  ArrayType,
  CustomExpectedValueTypeId,
  ExpectedValue,
  FlattenedCustomExpectedValueList,
} from "./expected-value-types";

export const getArrayExpectedValueType = (
  childrenTypeArray: CustomExpectedValueTypeId[],
): ArrayType => {
  const containsArray = childrenTypeArray.some((type) => type === "array");

  const containsObject = childrenTypeArray.some((type) => type === "object");

  const dataTypes = childrenTypeArray.filter(
    (type) =>
      type !== "array" && type !== "object" && dataTypeOptions.includes(type),
  );
  const containsDataType = !!dataTypes.length;

  if (containsArray && !containsObject && !containsDataType) {
    return ArrayType.arrayArray;
  } else if (containsObject && !containsArray && !containsDataType) {
    return ArrayType.propertyObjectArray;
  } else if (containsDataType && !containsArray && !containsObject) {
    const containsText = dataTypes.some(
      (type) => type === types.dataType.text.dataTypeId,
    );
    const containsBoolean = dataTypes.some(
      (type) => type === types.dataType.boolean.dataTypeId,
    );
    const containsNumber = dataTypes.some(
      (type) => type === types.dataType.number.dataTypeId,
    );

    if (containsText && !containsBoolean && !containsNumber) {
      return ArrayType.textArray;
    } else if (containsBoolean && !containsText && !containsNumber) {
      return ArrayType.booleanArray;
    } else if (containsNumber && !containsText && !containsBoolean) {
      return ArrayType.numberArray;
    }
  }

  return ArrayType.mixedArray;
};

export const getExpectedValueDescriptor = (
  id: string,
  flattenedExpectedValues: FlattenedCustomExpectedValueList,
): ExpectedValue => {
  const data = flattenedExpectedValues[id]?.data;

  if (!data) {
    throw new Error("Cannot get expected value descriptor, data missing");
  }

  switch (data.typeId) {
    case "array":
      return {
        typeId: "array",
        arrayType: getArrayExpectedValueType(
          Object.values(flattenedExpectedValues)
            .filter(({ parentId }) => parentId === id)
            .map(({ data: childData }) => {
              if (typeof childData !== "object") {
                throw new Error("Expected value doesn't have data");
              }

              return childData.typeId;
            }),
        ),
        id,
      };
    case "object":
      return {
        typeId: "object",
        id,
      };

    default:
      return data.typeId;
  }
};
