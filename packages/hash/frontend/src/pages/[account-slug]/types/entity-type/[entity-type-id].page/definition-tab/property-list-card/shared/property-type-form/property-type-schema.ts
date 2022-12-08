import { PropertyValues, VersionedUri } from "@blockprotocol/type-system";
import { DataType, ExpectedValue } from "../property-type-form-values";

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
