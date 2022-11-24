import { PropertyValues } from "@blockprotocol/type-system-web";

export function isNonNullable<T>(value: T): value is NonNullable<T> {
  return value !== null && value !== undefined;
}

export const isPropertyValueArray = (
  propertyValue: PropertyValues,
): propertyValue is PropertyValues.ArrayOfPropertyValues => {
  return "type" in propertyValue && propertyValue.type === "array";
};

export const isPropertyValueNested = (
  propertyValue: PropertyValues,
): propertyValue is PropertyValues.PropertyTypeObject => {
  return "type" in propertyValue && propertyValue.type === "object";
};
