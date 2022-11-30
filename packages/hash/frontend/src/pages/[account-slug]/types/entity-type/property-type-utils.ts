import { PropertyValues, VersionedUri } from "@blockprotocol/type-system-web";
import { faList } from "@fortawesome/free-solid-svg-icons";
import { types } from "@hashintel/hash-shared/types";
import { fa100 } from "../../../../shared/icons/pro/fa-100";
import { faCube } from "../../../../shared/icons/pro/fa-cube";
import { faSquareCheck } from "../../../../shared/icons/pro/fa-square-check";
import { faText } from "../../../../shared/icons/pro/fa-text";

export type ExpectedValue =
  | VersionedUri
  | {
      typeId: "array";
      id: string;
      flattenedProperties: Record<string, DataType>;
    };
export interface PrimitiveTypeData {
  typeId: VersionedUri;
}

export interface ArrayTypeData {
  typeId: "array";
  minItems: number;
  maxItems?: number;
  expectedValues: string[];
}

export interface DataType {
  id: string;
  parentId?: string;
  data?: PrimitiveTypeData | ArrayTypeData;
}

export const dataTypeOptions = [
  types.dataType.text.dataTypeId,
  types.dataType.number.dataTypeId,
  types.dataType.boolean.dataTypeId,
];

export const customDataTypeOptions = [
  "array",
  types.dataType.object.dataTypeId,
];

export const dataTypeData = {
  [types.dataType.text.dataTypeId]: {
    title: types.dataType.text.title,
    icon: faText,
  },
  [types.dataType.number.dataTypeId]: {
    title: types.dataType.number.title,
    icon: fa100,
  },
  [types.dataType.boolean.dataTypeId]: {
    title: types.dataType.boolean.title,
    icon: faSquareCheck,
  },
  array: {
    title: "Array",
    icon: faList.icon,
  },
  [types.dataType.object.dataTypeId]: {
    title: "Property Object",
    icon: faCube,
  },
};

export const getDefaultData = (
  typeId: string,
): PrimitiveTypeData | ArrayTypeData => {
  if (typeId === "array") {
    return {
      typeId: "array",
      minItems: 0,
      maxItems: 0,
      expectedValues: [],
    };
  }

  return {
    typeId: typeId as VersionedUri,
  };
};

export const getArraySchema = (
  expectedValues: string[],
  flattenedProperties: Record<string, DataType>,
): [PropertyValues, ...PropertyValues[]] =>
  expectedValues.map((value) => {
    const property = flattenedProperties[value];

    if (property?.data && "expectedValues" in property.data) {
      const { data } = property;

      return {
        type: "array",
        items: {
          oneOf: getArraySchema(data.expectedValues, flattenedProperties),
        },
        minItems: data?.minItems,
        maxItems: data?.maxItems,
      };
    }

    return {
      $ref: property!.data!.typeId,
    };
  }) as [PropertyValues, ...PropertyValues[]];

export const getPropertyTypeSchema = (values: ExpectedValue[]) =>
  values.map((value) => {
    if (typeof value === "object") {
      const { id, flattenedProperties } = value;
      const property = flattenedProperties[id];

      if (property?.data && "expectedValues" in property.data) {
        return {
          type: "array",
          items: {
            oneOf: getArraySchema(
              property.data.expectedValues as [string, ...string[]],
              flattenedProperties,
            ),
          },
          minItems: property.data.minItems,
          maxItems: property.data.maxItems,
        };
      }
    }

    return {
      $ref: value as VersionedUri,
    };
  }) as [PropertyValues, ...PropertyValues[]];
