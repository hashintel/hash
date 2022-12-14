import { types } from "@hashintel/hash-shared/ontology-types";
import { EditorType } from "./types";

export const guessEditorTypeFromValue = (
  value: unknown,
  expectedTypes: string[],
): EditorType => {
  if (
    typeof value === "string" &&
    expectedTypes.includes(types.dataType.text.title)
  ) {
    return "string";
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

  return "string";
};

export const guessEditorTypeFromExpectedType = (type: string): EditorType => {
  if (type === types.dataType.text.title) {
    return "string";
  }

  if (type === types.dataType.boolean.title) {
    return "boolean";
  }

  if (type === types.dataType.number.title) {
    return "number";
  }

  return "string";
};
