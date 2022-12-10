import { VersionedUri } from "@blockprotocol/type-system";

export enum ArrayType {
  dataTypeArray = "dataTypeArray",
  propertyObjectArray = "propertyObjectArray",
  mixedArray = "mixedArray",
}

interface PrimitiveTypeData {
  typeId: VersionedUri;
}

interface ArrayTypeData {
  typeId: "array";
  minItems: number;
  maxItems?: number;
  expectedValues: string[];
}

export interface DataType {
  id: string;
  parentId?: string;
  animatingOut?: boolean;
  data?: PrimitiveTypeData | ArrayTypeData;
}

export type ExpectedValue =
  | VersionedUri
  | {
      typeId: "array";
      arrayType: ArrayType;
      id: string;
      flattenedDataTypes: Record<string, DataType>;
    };

export type PropertyTypeFormValues = {
  name: string;
  description: string;
  expectedValues: ExpectedValue[];
  customDataTypeId?: string;
  editingDataTypeIndex?: number;
  flattenedDataTypeList: Record<string, DataType>;
};

export type DefaultDataTypeId = VersionedUri | "array";
export const getDefaultData = (
  typeId: DefaultDataTypeId,
): PrimitiveTypeData | ArrayTypeData => {
  if (typeId === "array") {
    return {
      typeId: "array",
      minItems: 0,
      maxItems: 0,
      expectedValues: [],
    };
  }

  return { typeId };
};
