import { types } from "@hashintel/hash-shared/ontology-types";

import { dataTypeOptions } from "./data-type-options";
import {
  ArrayExpectedValue,
  ArrayType,
  ExpectedValue,
  FlattenedCustomExpectedValueList,
} from "./expected-value-types";

const getArrayExpectedValueType = (
  data: ArrayExpectedValue,
  flattenedExpectedValues: FlattenedCustomExpectedValueList,
): ArrayType => {
  const containsArray = data.itemIds.some((itemId) => {
    const typeId = flattenedExpectedValues[itemId]?.data?.typeId;
    return typeId === "array";
  });

  const containsObject = data.itemIds.some(
    (itemId) => flattenedExpectedValues[itemId]?.data?.typeId === "object",
  );

  const dataTypes = data.itemIds.filter((itemId) => {
    const typeId = flattenedExpectedValues[itemId]?.data?.typeId!;
    return (
      typeId !== "array" &&
      typeId !== "object" &&
      dataTypeOptions.includes(typeId)
    );
  });
  const containsDataType = !!dataTypes.length;

  if (containsArray && !containsObject && !containsDataType) {
    return ArrayType.arrayArray;
  } else if (containsObject && !containsArray && !containsDataType) {
    return ArrayType.propertyObjectArray;
  } else if (containsDataType && !containsArray && !containsObject) {
    const containsText = dataTypes.some(
      (itemId) =>
        flattenedExpectedValues[itemId]?.data?.typeId ===
        types.dataType.text.dataTypeId,
    );
    const containsBoolean = dataTypes.some(
      (itemId) =>
        flattenedExpectedValues[itemId]?.data?.typeId ===
        types.dataType.boolean.dataTypeId,
    );
    const containsNumber = dataTypes.some(
      (itemId) =>
        flattenedExpectedValues[itemId]?.data?.typeId ===
        types.dataType.number.dataTypeId,
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
        arrayType: getArrayExpectedValueType(data, flattenedExpectedValues),
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
