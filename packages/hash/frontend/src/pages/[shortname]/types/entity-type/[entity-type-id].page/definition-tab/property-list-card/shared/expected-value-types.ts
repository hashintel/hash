import { VersionedUri } from "@blockprotocol/type-system";

export enum ArrayType {
  dataTypeArray = "dataTypeArray",
  propertyObjectArray = "propertyObjectArray",
  mixedArray = "mixedArray",
  arrayArray = "arrayArray",
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

export type FlattenedCustomExpectedValueList = Record<
  string,
  CustomExpectedValue
>;
