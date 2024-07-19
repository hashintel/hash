import type {
  DataType,
  EntityType,
  PropertyType,
} from "@blockprotocol/type-system/slim";

const isObjectWithKindString = (
  object: unknown,
  kind: string,
): object is { kind: string } => {
  return (
    typeof object === "object" &&
    object !== null &&
    "kind" in object &&
    typeof object.kind === "string" &&
    object.kind === kind
  );
};

export const isDataType = (type: any): type is DataType => {
  /* @todo - check `validateDataType` */
  return Boolean(isObjectWithKindString(type, "dataType"));
};

export const isPropertyType = (type: any): type is PropertyType => {
  /* @todo - check `validatePropertyType` */
  return Boolean(isObjectWithKindString(type, "propertyType"));
};

export const isEntityType = (type: any): type is EntityType => {
  /* @todo - check `validateEntityType` */
  return Boolean(isObjectWithKindString(type, "entityType"));
};
