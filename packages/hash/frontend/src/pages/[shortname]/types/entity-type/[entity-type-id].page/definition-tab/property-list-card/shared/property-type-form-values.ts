import { VersionedUri } from "@blockprotocol/type-system";
import { dataTypeOptions } from "./property-type-form/shared/data-type-options";

export enum ArrayType {
  dataTypeArray = "dataTypeArray",
  propertyObjectArray = "propertyObjectArray",
  mixedArray = "mixedArray",
  arrayArray = "arrayArray",
}

interface PrimitiveExpectedValue {
  typeId: VersionedUri;
}

export interface ArrayExpectedValue {
  typeId: "array";
  minItems: number;
  maxItems: number;
  infinity: boolean;
  itemIds: string[];
}

export interface Property {
  id: VersionedUri;
  required: boolean;
  allowArrays: boolean;
  animatingOut?: boolean;
}

interface ObjectExpectedValue {
  typeId: "object";
  properties: Property[];
}

export type CustomExpectedValueData =
  | PrimitiveExpectedValue
  | ArrayExpectedValue
  | ObjectExpectedValue;

export interface CustomExpectedValue {
  id: string;
  parentId?: string;
  animatingOut?: boolean;
  data?: CustomExpectedValueData;
}

export type ExpectedValue =
  | VersionedUri
  | {
      typeId: "array";
      arrayType: ArrayType;
      id: string;
    }
  | {
      typeId: "object";
      id: string;
    };

export type PropertyTypeFormValues = {
  name: string;
  description: string;
  expectedValues: ExpectedValue[];
  customExpectedValueId?: string;
  editingExpectedValueIndex?: number;
  flattenedCustomExpectedValueList: Record<string, CustomExpectedValue>;
};

export type DefaultExpectedValueTypeId = VersionedUri | "array" | "object";

export const arrayExpectedValueDataDefaults = {
  minItems: 0,
  maxItems: 0,
};

export const getDefaultExpectedValue = (
  typeId: DefaultExpectedValueTypeId,
): CustomExpectedValueData => {
  if (typeId === "object") {
    return {
      typeId: "object",
      properties: [],
    };
  } else if (typeId === "array") {
    return {
      typeId: "array",
      itemIds: [],
      infinity: true,
      ...arrayExpectedValueDataDefaults,
    };
  }

  return { typeId };
};

const getArrayExpectedValueType = (
  data: ArrayExpectedValue,
  flattenedExpectedValues: PropertyTypeFormValues["flattenedCustomExpectedValueList"],
): ArrayType => {
  const containsArray = data.itemIds.some((itemId) => {
    const typeId = flattenedExpectedValues[itemId]?.data?.typeId;
    return typeId === "array";
  });

  const containsObject = data.itemIds.some(
    (itemId) => flattenedExpectedValues[itemId]?.data?.typeId === "object",
  );

  const containsDataType = data.itemIds.some((itemId) => {
    const typeId = flattenedExpectedValues[itemId]?.data?.typeId!;
    return (
      typeId !== "array" &&
      typeId !== "object" &&
      dataTypeOptions.includes(typeId)
    );
  });

  if (containsArray && !containsObject && !containsDataType) {
    return ArrayType.arrayArray;
  } else if (containsObject && !containsArray && !containsDataType) {
    return ArrayType.propertyObjectArray;
  } else if (containsDataType && !containsArray && !containsObject) {
    return ArrayType.dataTypeArray;
  }

  return ArrayType.mixedArray;
};

export const getExpectedValueDescriptor = (
  id: string,
  flattenedExpectedValues: PropertyTypeFormValues["flattenedCustomExpectedValueList"],
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
