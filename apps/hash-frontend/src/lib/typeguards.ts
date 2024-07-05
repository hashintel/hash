import type {
  ArraySchema,
  ObjectSchema,
  OneOfSchema,
  PropertyTypeReference,
  PropertyValues,
  ValueOrArray,
} from "@blockprotocol/type-system";

export function isNonNullable<T>(value: T): value is NonNullable<T> {
  return value !== null && value !== undefined;
}

export const isPropertyValueArray = (
  propertyValue: PropertyValues,
): propertyValue is ArraySchema<OneOfSchema<PropertyValues>> => {
  return "type" in propertyValue && propertyValue.type === "array";
};

export const isPropertyValuePropertyObject = (
  propertyValue: PropertyValues,
): propertyValue is ObjectSchema<ValueOrArray<PropertyTypeReference>> => {
  return "type" in propertyValue && propertyValue.type === "object";
};
