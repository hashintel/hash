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
  ArrayExpectedValue,
  CustomExpectedValue,
  ExpectedValue,
  Property,
  PropertyTypeFormValues,
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
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        return getArraySchema(flattenedExpectedValues, property.data);
      } else if ("properties" in property.data) {
        return getObjectSchema(property.data.properties);
      }
    }
    return {
      $ref: property!.data!.typeId,
    };
  }) as [PropertyValues, ...PropertyValues[]];

export const getArraySchema = (
  flattenedExpectedValues: Record<string, CustomExpectedValue>,
  { minItems, maxItems, infinity, itemIds }: ArrayExpectedValue,
): Array<OneOf<PropertyValues>> => ({
  type: "array",
  items: {
    oneOf: getArrayItems(itemIds, flattenedExpectedValues),
  },
  minItems,
  ...(!infinity ? { maxItems } : {}),
});

export const getPropertyTypeSchema = (
  values: ExpectedValue[],
  flattenedExpectedValues: PropertyTypeFormValues["flattenedCustomExpectedValueList"],
) =>
  values.map((value) => {
    if (typeof value === "object") {
      const property = flattenedExpectedValues[value.id];

      if (property?.data && "itemIds" in property.data) {
        return getArraySchema(flattenedExpectedValues, property.data);
      } else if (property?.data && "properties" in property.data) {
        return getObjectSchema(property.data.properties);
      }
    }

    return {
      $ref: value as VersionedUri,
    };
  }) as [PropertyValues, ...PropertyValues[]];
