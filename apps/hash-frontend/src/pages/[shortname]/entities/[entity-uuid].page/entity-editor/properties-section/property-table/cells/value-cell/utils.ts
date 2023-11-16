import { blockProtocolDataTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { isPlainObject } from "lodash";

import { editorSpecs } from "./editor-specs";
import { EditorType } from "./types";

const isEmptyArray = (value: unknown) => Array.isArray(value) && !value.length;

export const guessEditorTypeFromValue = (
  value: unknown,
  expectedTypes: string[],
): EditorType => {
  if (
    typeof value === "string" &&
    expectedTypes.includes(blockProtocolDataTypes.text.title)
  ) {
    return "text";
  }

  if (
    typeof value === "boolean" &&
    expectedTypes.includes(blockProtocolDataTypes.boolean.title)
  ) {
    return "boolean";
  }

  if (
    typeof value === "number" &&
    expectedTypes.includes(blockProtocolDataTypes.number.title)
  ) {
    return "number";
  }

  if (
    isPlainObject(value) &&
    expectedTypes.includes(blockProtocolDataTypes.object.title)
  ) {
    return "object";
  }

  if (
    value === null &&
    expectedTypes.includes(blockProtocolDataTypes.null.title)
  ) {
    return "null";
  }

  if (
    isEmptyArray(value) &&
    expectedTypes.includes(blockProtocolDataTypes.emptyList.title)
  ) {
    return "emptyList";
  }

  return "unknown";
};

export const guessEditorTypeFromExpectedType = (type: string): EditorType => {
  const editorSpecEntries = Object.entries(editorSpecs);

  const foundEntry = editorSpecEntries.find(([_, val]) => val.title === type);

  if (foundEntry) {
    const editorSpecsKey = foundEntry[0];
    return editorSpecsKey as EditorType;
  }

  return "unknown";
};

export const findDataTypeDefinitionByTitle = (title: string) => {
  const foundDataTypeDef = Object.values(blockProtocolDataTypes).find(
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
