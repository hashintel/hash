import {
  PropertyType,
  PropertyValues,
  VersionedUri,
} from "@blockprotocol/type-system-web";
import { IconDefinition } from "@fortawesome/free-regular-svg-icons";
import { types } from "@hashintel/hash-shared/types";
import { fa100 } from "../../../../shared/icons/pro/fa-100";
import { faSquareCheck } from "../../../../shared/icons/pro/fa-square-check";
import { faText } from "../../../../shared/icons/pro/fa-text";

export interface ArrayData {
  minItems: number;
  maxItems?: number;
  expectedValues: string[];
}

export interface PrimitiveTypeData {
  typeId: VersionedUri;
}

export interface DataType {
  parentId?: string;
  title: string;
  icon: IconDefinition["icon"];
  dataTypeId?: VersionedUri;
  data: PrimitiveTypeData | ArrayData;
  schema?: PropertyValues;
}

export const propertyTypeDataTypes: DataType[] = [
  {
    title: types.dataType.text.title,
    icon: faText,
    data: {
      typeId: types.dataType.text.dataTypeId,
    },
  },
  {
    title: types.dataType.number.title,
    icon: fa100,
    data: {
      typeId: types.dataType.number.dataTypeId,
    },
  },
  {
    title: types.dataType.boolean.title,
    icon: faSquareCheck,
    data: {
      typeId: types.dataType.boolean.dataTypeId,
    },
  },
];

export const getPropertyTypeSchema = (
  { data }: DataType,
  flattenedProperties: Record<string, DataType>,
): PropertyValues => {
  if ("expectedValues" in data) {
    return {
      type: "array",
      items: {
        oneOf: data?.expectedValues
          ? data?.expectedValues.map((childId) =>
              getPropertyTypeSchema(
                flattenedProperties[childId]!,
                flattenedProperties,
              ),
            )
          : [],
      },
      minItems: data?.minItems,
      maxItems: data?.maxItems,
    };
  }

  return {
    $ref: data.typeId,
  };
};
export const getChildrenSchema = (
  expectedValues: DataType[],
): PropertyValues[] => {
  return expectedValues.map(({ data }) => {
    if ("expectedValues" in data) {
      return {
        type: "array",
        items: {
          oneOf: data?.expectedValues
            ? getChildrenSchema(data?.expectedValues)
            : [],
        },
        minItems: data?.minItems,
        maxItems: data?.maxItems,
      };
    }

    return {
      $ref: data.typeId,
    };
  });
};
