import { PropertyValues, VersionedUri } from "@blockprotocol/type-system";
import {
  CustomExpectedValue,
  ExpectedValue,
} from "../property-type-form-values";

export const getArraySchema = (
  itemIds: string[],
  flattenedExpectedValues: Record<string, CustomExpectedValue>,
): [PropertyValues, ...PropertyValues[]] =>
  itemIds.map((itemId) => {
    const property = flattenedExpectedValues[itemId];

    if (property?.data && "itemIds" in property.data) {
      const { data } = property;

      return {
        type: "array",
        items: {
          oneOf: getArraySchema(data.itemIds, flattenedExpectedValues),
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
      const { id, flattenedExpectedValues } = value;
      const property = flattenedExpectedValues[id];

      if (property?.data && "itemIds" in property.data) {
        return {
          type: "array",
          items: {
            oneOf: getArraySchema(
              property.data.itemIds,
              flattenedExpectedValues,
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
