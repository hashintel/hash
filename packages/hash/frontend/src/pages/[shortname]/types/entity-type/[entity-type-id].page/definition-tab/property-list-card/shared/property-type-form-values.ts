import { VersionedUri } from "@blockprotocol/type-system";

export enum ArrayType {
  dataTypeArray = "dataTypeArray",
  propertyObjectArray = "propertyObjectArray",
  mixedArray = "mixedArray",
  arrayArray = "arrayArray",
}

interface PrimitiveExpectedValue {
  typeId: VersionedUri;
}

interface ArrayExpectedValue {
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

export interface CustomExpectedValue {
  id: string;
  parentId?: string;
  animatingOut?: boolean;
  data?: PrimitiveExpectedValue | ArrayExpectedValue | ObjectExpectedValue;
}

export type ExpectedValue =
  | VersionedUri
  | {
      typeId: "array";
      arrayType: ArrayType;
      id: string;
      flattenedExpectedValues: Record<string, CustomExpectedValue>;
    }
  | {
      typeId: "object";
      id: string;
      flattenedExpectedValues: Record<string, CustomExpectedValue>;
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

export const getDefaultExpectedValue = (
  typeId: DefaultExpectedValueTypeId,
): PrimitiveExpectedValue | ArrayExpectedValue | ObjectExpectedValue => {
  if (typeId === "object") {
    return {
      typeId: "object",
      properties: [],
    };
  } else if (typeId === "array") {
    return {
      typeId: "array",
      minItems: 0,
      maxItems: 0,
      infinity: false,
      itemIds: [],
    };
  }

  return { typeId };
};
