import type {
  DataType,
  EntityType,
  PropertyType,
} from "@blockprotocol/type-system";

const isObjectWithKindString = (
  obj: unknown,
  kind: string,
): obj is { kind: string } => {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "kind" in obj &&
    typeof obj.kind === "string" &&
    obj.kind === kind
  );
};

export const isDataType = (type: any): type is DataType => {
  /* @todo - check `validateDataType` */
  return !!isObjectWithKindString(type, "dataType");
};

export const isPropertyType = (type: any): type is PropertyType => {
  /* @todo - check `validatePropertyType` */
  return !!isObjectWithKindString(type, "propertyType");
};

export const isEntityType = (type: any): type is EntityType => {
  /* @todo - check `validateEntityType` */
  return !!isObjectWithKindString(type, "entityType");
};
