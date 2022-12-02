import { PropertyValues, VersionedUri } from "@blockprotocol/type-system-web";
import { faList, faListCheck } from "@fortawesome/free-solid-svg-icons";
import { theme } from "@hashintel/hash-design-system";
import { types } from "@hashintel/hash-shared/types";
import { fa100 } from "../../../../shared/icons/pro/fa-100";
import { faCube } from "../../../../shared/icons/pro/fa-cube";
import { faCubes } from "../../../../shared/icons/pro/fa-cubes";
import { faSquareCheck } from "../../../../shared/icons/pro/fa-square-check";
import { faText } from "../../../../shared/icons/pro/fa-text";

export enum ArrayType {
  dataTypeArray = "dataTypeArray",
  propertyObjectArray = "propertyObjectArray",
  mixedArray = "mixedArray",
}

export type PrimitiveExpectedValue = VersionedUri;

export type ArrayExpectedValue = {
  typeId: "array";
  arrayType: ArrayType;
  id: string;
  flattenedDataTypes: Record<string, DataType>;
};

export type ExpectedValue = PrimitiveExpectedValue | ArrayExpectedValue;
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

const chipColors = {
  blue: {
    textColor: theme.palette.blue[80],
    backgroundColor: theme.palette.blue[20],
    hoveredButtonColor: theme.palette.blue[60],
  },
  purple: {
    textColor: theme.palette.purple[70],
    backgroundColor: theme.palette.purple[20],
    hoveredButtonColor: theme.palette.purple[50],
  },
  turquoise: {
    textColor: theme.palette.turquoise[70],
    backgroundColor: theme.palette.turquoise[20],
    hoveredButtonColor: theme.palette.turquoise[50],
  },
};

export const dataTypeData = {
  [types.dataType.text.dataTypeId]: {
    title: types.dataType.text.title,
    icon: faText,
    colors: chipColors.blue,
  },
  [types.dataType.number.dataTypeId]: {
    title: types.dataType.number.title,
    icon: fa100,
    colors: chipColors.blue,
  },
  [types.dataType.boolean.dataTypeId]: {
    title: types.dataType.boolean.title,
    icon: faSquareCheck,
    colors: chipColors.blue,
  },
  [types.dataType.object.dataTypeId]: {
    title: "Property Object",
    icon: faCube,
    colors: chipColors.purple,
  },
  array: {
    title: "Array",
    icon: faList.icon,
    colors: chipColors.blue,
  },
  dataTypeArray: {
    title: "Data Type Array",
    icon: faListCheck.icon,
    colors: chipColors.blue,
  },
  propertyObjectArray: {
    title: "Property Object Array",
    icon: faCubes,
    colors: chipColors.purple,
  },
  mixedArray: {
    title: "Mixed Array",
    icon: faList.icon,
    colors: chipColors.turquoise,
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
  flattenedDataTypes: Record<string, DataType>,
): [PropertyValues, ...PropertyValues[]] =>
  expectedValues.map((value) => {
    const property = flattenedDataTypes[value];

    if (property?.data && "expectedValues" in property.data) {
      const { data } = property;

      return {
        type: "array",
        items: {
          oneOf: getArraySchema(data.expectedValues, flattenedDataTypes),
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
      const { id, flattenedDataTypes } = value;
      const property = flattenedDataTypes[id];

      if (property?.data && "expectedValues" in property.data) {
        return {
          type: "array",
          items: {
            oneOf: getArraySchema(
              property.data.expectedValues,
              flattenedDataTypes,
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
