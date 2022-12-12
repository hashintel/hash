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
  maxItems?: number;
  itemIds: string[];
}

export interface CustomExpectedValue {
  id: string;
  parentId?: string;
  animatingOut?: boolean;
  data?: PrimitiveExpectedValue | ArrayExpectedValue;
}

export type ExpectedValue =
  | VersionedUri
  | {
      typeId: "array";
      arrayType: ArrayType;
      id: string;
      flattenedExpectedValues: Record<string, CustomExpectedValue>;
    };

export type BaseTypeFormValues = {
  name: string;
  description: string;
};

export type PropertyTypeFormValues = BaseTypeFormValues & {
  expectedValues: ExpectedValue[];
  customExpectedValueId?: string;
  editingExpectedValueIndex?: number;
  flattenedCustomExpectedValueList: Record<string, CustomExpectedValue>;
};

export type DefaultExpectedValueTypeId = VersionedUri | "array";

export const getDefaultExpectedValue = (
  typeId: DefaultExpectedValueTypeId,
): PrimitiveExpectedValue | ArrayExpectedValue => {
  if (typeId === "array") {
    return {
      typeId: "array",
      minItems: 0,
      maxItems: 0,
      itemIds: [],
    };
  }

  return { typeId };
};
