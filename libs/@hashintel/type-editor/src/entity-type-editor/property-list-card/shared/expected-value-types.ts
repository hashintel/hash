import type { VersionedUrl } from "@blockprotocol/type-system/slim";

export type ExpectedValue =
  | VersionedUrl
  | {
      typeId: "array";
      id: string;
    }
  | {
      typeId: "object";
      id: string;
    };

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
