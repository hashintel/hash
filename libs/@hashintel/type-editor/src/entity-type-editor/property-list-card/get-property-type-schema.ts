import type {
  BaseUrl,
  OneOfSchema,
  PropertyType,
  PropertyTypeReference,
  PropertyValueArray,
  PropertyValueObject,
  PropertyValues,
  ValueOrArray,
  VersionedUrl,
} from "@blockprotocol/type-system";
import { atLeastOne, extractBaseUrl } from "@blockprotocol/type-system";

import type {
  ArrayExpectedValue,
  CustomExpectedValue,
  CustomExpectedValueData,
  Property,
} from "./shared/expected-value-types";
import type { PropertyTypeFormValues } from "./shared/property-type-form-values";

const getPrimitiveSchema = ($ref: VersionedUrl): PropertyTypeReference => ({
  $ref,
});

const getObjectSchema = (
  properties: Property[],
): PropertyValueObject<ValueOrArray<PropertyTypeReference>> => {
  const propertyList: Record<BaseUrl, ValueOrArray<PropertyTypeReference>> = {};
  const requiredArray: BaseUrl[] = [];

  for (const { id, allowArrays, required } of properties) {
    const baseUrl = extractBaseUrl(id);

    const propertyTypeReference = getPrimitiveSchema(id);

    if (allowArrays) {
      propertyList[baseUrl] = {
        type: "array",
        items: propertyTypeReference,
      };
    } else {
      propertyList[baseUrl] = propertyTypeReference;
    }

    if (required) {
      requiredArray.push(baseUrl);
    }
  }

  return {
    type: "object",
    properties: propertyList,
    required: atLeastOne(requiredArray),
  };
};

const getArraySchema = (
  flattenedExpectedValues: Record<string, CustomExpectedValue>,
  { minItems, maxItems, infinity, itemIds }: ArrayExpectedValue,
): PropertyValueArray<OneOfSchema<PropertyValues>> => ({
  type: "array",
  items: {
    oneOf: itemIds.map((itemId) =>
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      getExpectedValueSchemaById(itemId, flattenedExpectedValues),
    ) as OneOfSchema<PropertyValues>["oneOf"],
  },
  minItems,
  ...(!infinity ? { maxItems } : {}),
});

const getExpectedValueDataSchema = (
  data: CustomExpectedValueData,
  flattenedExpectedValues: Record<string, CustomExpectedValue>,
) => {
  switch (data.typeId) {
    case "array":
      return getArraySchema(flattenedExpectedValues, data);
    case "object":
      return getObjectSchema(data.properties);
    default:
      return getPrimitiveSchema(data.typeId);
  }
};

const getExpectedValueSchemaById = (
  id: string,
  flattenedExpectedValues: Record<string, CustomExpectedValue>,
) => {
  const expectedValue = flattenedExpectedValues[id];

  if (!expectedValue) {
    throw new Error("Missing expected value");
  }

  const data = expectedValue.data;

  if (!data) {
    throw new Error("Missing expected value data");
  }

  return getExpectedValueDataSchema(data, flattenedExpectedValues);
};

export const getPropertyTypeSchema = (
  data: PropertyTypeFormValues,
): Omit<PropertyType, "$schema" | "kind" | "$id"> => {
  if (!data.expectedValues.length) {
    throw new Error("Must have an expected value");
  }

  const oneOf = data.expectedValues.map((value) => {
    if (typeof value === "object") {
      return getExpectedValueSchemaById(
        value.id,
        data.flattenedCustomExpectedValueList,
      );
    }

    return getPrimitiveSchema(value);
  }) as OneOfSchema<PropertyValues>["oneOf"];

  return {
    oneOf,
    description: data.description,
    title: data.name,
  };
};
