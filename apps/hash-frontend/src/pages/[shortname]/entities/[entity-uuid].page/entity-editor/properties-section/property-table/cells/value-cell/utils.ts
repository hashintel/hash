import { types } from "@local/hash-isomorphic-utils/ontology-types";

import { EditorType } from "./types";

export const guessEditorTypeFromValue = (
  value: unknown,
  expectedTypes: string[],
): EditorType => {
  if (
    typeof value === "string" &&
    expectedTypes.includes(types.dataType.text.title)
  ) {
    return "text";
  }

  if (
    typeof value === "boolean" &&
    expectedTypes.includes(types.dataType.boolean.title)
  ) {
    return "boolean";
  }

  if (
    typeof value === "number" &&
    expectedTypes.includes(types.dataType.number.title)
  ) {
    return "number";
  }

  return "text";
};

export const guessEditorTypeFromExpectedType = (type: string): EditorType => {
  if (type === types.dataType.text.title) {
    return "text";
  }

  if (type === types.dataType.boolean.title) {
    return "boolean";
  }

  if (type === types.dataType.number.title) {
    return "number";
  }

  return "text";
};

export const findDataTypeDefinitionByTitle = (title: string) => {
  const foundDataTypeDef = Object.values(types.dataType).find(
    (val) => val.title === title,
  );

  if (!foundDataTypeDef) {
    throw new Error(`Not found matching data type definition with ${title}`);
  }

  return foundDataTypeDef;
};

export const isBlankStringOrNullish = (value: unknown) => {
  const isBlankString = typeof value === "string" && !value.trim().length;
  return isBlankString || value === null || value === undefined;
};
