import {
  Array,
  BaseUri,
  extractBaseUri,
  Object,
  OneOf,
  PropertyType,
  PropertyTypeReference,
  PropertyValues,
  ValueOrArray,
  VersionedUri,
} from "@blockprotocol/type-system";

import {
  ArrayExpectedValue,
  CustomExpectedValue,
  CustomExpectedValueData,
  Property,
  PropertyTypeFormValues,
} from "./shared/property-type-form-values";

const getPropertyTypeReferenceSchema = (
  $ref: VersionedUri,
): PropertyTypeReference => ({
  $ref,
});

const getObjectSchema = (
  properties: Property[],
): Object<ValueOrArray<PropertyTypeReference>> => {
  const propertyList: Record<BaseUri, ValueOrArray<PropertyTypeReference>> = {};
  const requiredArray: BaseUri[] = [];

  for (const { id, allowArrays, required } of properties) {
    const baseUri = extractBaseUri(id);

    const propertyTypeReference = getPropertyTypeReferenceSchema(id);

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

const getArraySchema = (
  flattenedExpectedValues: Record<string, CustomExpectedValue>,
  { minItems, maxItems, infinity, itemIds }: ArrayExpectedValue,
): Array<OneOf<PropertyValues>> => ({
  type: "array",
  items: {
    oneOf: itemIds.map((itemId) =>
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      getExpectedValueSchemaById(itemId, flattenedExpectedValues),
    ) as OneOf<PropertyValues>["oneOf"],
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
      return getPropertyTypeReferenceSchema(data.typeId);
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
): Omit<PropertyType, "$id"> => {
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

    return getPropertyTypeReferenceSchema(value);
  }) as OneOf<PropertyValues>["oneOf"];

  return {
    oneOf,
    description: data.description,
    title: data.name,
    kind: "propertyType" as const,
  };
};
