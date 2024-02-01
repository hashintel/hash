import { DataTypeWithMetadata } from "@local/hash-subgraph";
import { isPlainObject } from "lodash";

import { EditorType } from "./types";

const isEmptyArray = (value: unknown) => Array.isArray(value) && !value.length;

export const guessEditorTypeFromValue = (
  value: unknown,
  expectedTypes: DataTypeWithMetadata["schema"][],
): EditorType => {
  if (
    typeof value === "string" &&
    expectedTypes.some((dataType) => dataType.type === "string")
  ) {
    return "string";
  }

  if (
    typeof value === "boolean" &&
    expectedTypes.some((dataType) => dataType.type === "boolean")
  ) {
    return "boolean";
  }

  if (
    typeof value === "number" &&
    expectedTypes.some((dataType) => dataType.type === "number")
  ) {
    return "number";
  }

  if (
    isPlainObject(value) &&
    expectedTypes.some((dataType) => dataType.type === "object")
  ) {
    return "object";
  }

  if (
    value === null &&
    expectedTypes.some((dataType) => dataType.type === "null")
  ) {
    return "null";
  }

  if (
    isEmptyArray(value) &&
    expectedTypes.some((dataType) => dataType.title === "Empty List")
  ) {
    return "emptyList";
  }

  return "unknown";
};

export const guessEditorTypeFromExpectedType = (
  dataType: DataTypeWithMetadata["schema"],
): EditorType => {
  if (dataType.title === "Empty List") {
    return "emptyList";
  }

  if (dataType.type === "array") {
    throw new Error("Array data types are not yet handled.");
  }

  return dataType.type === "integer" ? "number" : dataType.type;
};

export const isBlankStringOrNullish = (value: unknown) => {
  const isBlankString = typeof value === "string" && !value.trim().length;
  return isBlankString || value === null || value === undefined;
};
