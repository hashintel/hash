import {
  Array,
  BaseUri,
  extractBaseUri,
  Object,
  OneOf,
  PropertyTypeReference,
  PropertyValues,
  ValueOrArray,
  VersionedUri,
} from "@blockprotocol/type-system";

import {
  CustomExpectedValue,
  ExpectedValue,
  Property,
} from "../property-type-form-values";

export const getObjectSchema = (
  properties: Property[],
): Object<ValueOrArray<PropertyTypeReference>> => {
  const propertyList: Record<BaseUri, ValueOrArray<PropertyTypeReference>> = {};
  const requiredArray: BaseUri[] = [];

  for (const { id, allowArrays, required } of properties) {
    const baseUri = extractBaseUri(id);

    const propertyTypeReference: PropertyTypeReference = {
      $ref: id,
    };

    if (allowArrays) {
      propertyList[baseUri] = {
        type: "array",
        items: propertyTypeReference,
      };
    } else {
      propertyList[baseUri] = propertyTypeReference;
    }

    if (required) {
      requiredArray.push(baseUri);
    }
  }

  return {
    type: "object",
    properties: propertyList,
    required: requiredArray,
  };
};

export const getArrayItems = (
  itemIds: string[],
  flattenedExpectedValues: Record<string, CustomExpectedValue>,
): [PropertyValues, ...PropertyValues[]] =>
  itemIds.map((itemId) => {
    const property = flattenedExpectedValues[itemId];

    if (property?.data) {
      if ("itemIds" in property.data) {
        const { data } = property;

        return {
          type: "array",
          items: {
            oneOf: getArrayItems(data.itemIds, flattenedExpectedValues),
          },
          ...(data.minItems ? { minItems: data.minItems } : {}),
          ...(data.maxItems && !data.infinity
            ? { maxItems: data.maxItems }
            : {}),
        };
      } else if ("properties" in property.data) {
        return getObjectSchema(property.data.properties);
      }
    }
    return {
      $ref: property!.data!.typeId,
    };
  }) as [PropertyValues, ...PropertyValues[]];

export const getArraySchema = (
  itemIds: string[],
  flattenedExpectedValues: Record<string, CustomExpectedValue>,
  minItems: number,
  maxItems: number,
  infinity: boolean,
): Array<OneOf<PropertyValues>> => ({
  type: "array",
  items: {
    oneOf: getArrayItems(itemIds, flattenedExpectedValues),
  },
  ...(minItems ? { minItems } : {}),
  ...(maxItems && !infinity ? { maxItems } : {}),
});

export const getPropertyTypeSchema = (values: ExpectedValue[]) =>
  values.map((value) => {
    if (typeof value === "object") {
      const { id, flattenedExpectedValues } = value;
      const property = flattenedExpectedValues[id];

      if (property?.data && "itemIds" in property.data) {
        return getArraySchema(
          property.data.itemIds,
          flattenedExpectedValues,
          property.data.minItems,
          property.data.maxItems,
          property.data.infinity,
        );
      } else if (property?.data && "properties" in property.data) {
        return getObjectSchema(property.data.properties);
      }
    }

    return {
      $ref: value as VersionedUri,
    };
  }) as [PropertyValues, ...PropertyValues[]];
