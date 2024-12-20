import type {
  OneOfSchema,
  PropertyTypeReference,
  PropertyValueArray,
  PropertyValueObject,
  PropertyValues,
  ValueOrArray,
} from "@blockprotocol/type-system";

export function isNonNullable<T>(value: T): value is NonNullable<T> {
  return value !== null && value !== undefined;
}

export const isPropertyValueArray = (
  propertyValue: PropertyValues,
): propertyValue is PropertyValueArray<OneOfSchema<PropertyValues>> => {
  return "type" in propertyValue && propertyValue.type === "array";
};

export const isPropertyValueObject = (
  propertyValue: PropertyValues,
): propertyValue is PropertyValueObject<
  ValueOrArray<PropertyTypeReference>
> => {
  return "type" in propertyValue && propertyValue.type === "object";
};
