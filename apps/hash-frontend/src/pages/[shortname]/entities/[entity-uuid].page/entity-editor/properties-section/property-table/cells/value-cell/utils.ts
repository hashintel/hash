import { blockProtocolTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
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
    expectedTypes.includes(blockProtocolTypes.dataType.text.title)
  ) {
    return "text";
  }

  if (
    typeof value === "boolean" &&
    expectedTypes.includes(blockProtocolTypes.dataType.boolean.title)
  ) {
    return "boolean";
  }

  if (
    typeof value === "number" &&
    expectedTypes.includes(blockProtocolTypes.dataType.number.title)
  ) {
    return "number";
  }

  if (
    isPlainObject(value) &&
    expectedTypes.includes(blockProtocolTypes.dataType.object.title)
  ) {
    return "object";
  }

  if (
    value === null &&
    expectedTypes.includes(blockProtocolTypes.dataType.null.title)
  ) {
    return "null";
  }

  if (
    isEmptyArray(value) &&
    expectedTypes.includes(blockProtocolTypes.dataType.emptyList.title)
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
  const foundDataTypeDef = Object.values(blockProtocolTypes.dataType).find(
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
