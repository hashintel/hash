import { VersionedUrl } from "@blockprotocol/type-system/slim";

export enum ArrayType {
  propertyObjectArray = "propertyObjectArray",
  mixedArray = "mixedArray",
  arrayArray = "arrayArray",
  textArray = "textArray",
  booleanArray = "booleanArray",
  numberArray = "numberArray",
}

export type ExpectedValue =
  | VersionedUrl
  | {
      typeId: "array";
      arrayType: ArrayType;
      id: string;
    }
  | {
      typeId: "object";
      id: string;
    };

export type CustomExpectedValueTypeId = VersionedUrl | "array" | "object";

interface PrimitiveExpectedValue {
  typeId: VersionedUrl;
}

export interface ArrayExpectedValue {
  typeId: "array";
  minItems: number;
  maxItems: number;
  infinity: boolean;
  itemIds: string[];
}

export interface Property {
  id: VersionedUrl;
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
