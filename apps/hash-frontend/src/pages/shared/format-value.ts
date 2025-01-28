import type { JsonValue } from "@blockprotocol/core";
import { customColors } from "@hashintel/design-system/theme";
import {
  isArrayMetadata,
  isValueMetadata,
  type PropertyMetadata,
} from "@local/hash-graph-types/entity";
import type {
  ClosedDataTypeDefinition,
  ClosedMultiEntityTypesDefinitions,
} from "@local/hash-graph-types/ontology";
import {
  formatDataValue,
  type FormattedValuePart,
  getMergedDataTypeSchema,
} from "@local/hash-isomorphic-utils/data-types";

export const formatValue = (
  value: unknown,
  valueMetadata: PropertyMetadata,
  dataTypePool:
    | ClosedDataTypeDefinition[]
    | ClosedMultiEntityTypesDefinitions["dataTypes"],
): FormattedValuePart[] => {
  const valueParts: FormattedValuePart[] = [];
  if (Array.isArray(value)) {
    for (const [index, entry] of value.entries()) {
      if (!isArrayMetadata(valueMetadata)) {
        throw new Error(
          `Expected array metadata for value '${JSON.stringify(value)}', got ${JSON.stringify(valueMetadata)}`,
        );
      }

      const arrayItemMetadata = valueMetadata.value[index];

      if (!arrayItemMetadata) {
        throw new Error(
          `Expected metadata for array item at index ${index} in value '${JSON.stringify(value)}'`,
        );
      }

      if (!isValueMetadata(arrayItemMetadata)) {
        throw new Error(
          `Expected single value metadata for array item at index ${index} in value '${JSON.stringify(value)}', got ${JSON.stringify(arrayItemMetadata)}`,
        );
      }

      const dataTypeId = arrayItemMetadata.metadata.dataTypeId;

      if (!dataTypeId) {
        throw new Error(
          "Expected a dataTypeId to be set on the value metadata",
        );
      }

      const dataType = Array.isArray(dataTypePool)
        ? dataTypePool.find((type) => type.schema.$id === dataTypeId)
        : dataTypePool[dataTypeId];

      if (!dataType) {
        throw new Error(
          "Expected a data type to be set on the value or at least one permitted data type",
        );
      }

      const schema = getMergedDataTypeSchema(dataType.schema);

      if ("anyOf" in schema) {
        throw new Error(
          "Data types with different expected sets of constraints (anyOf) are not yet supported",
        );
      }

      valueParts.push(...formatDataValue(entry, schema));
      if (index < value.length - 1) {
        valueParts.push({
          text: ", ",
          color: customColors.gray[60],
          type: "rightLabel",
        });
      }
    }
  } else {
    if (!isValueMetadata(valueMetadata)) {
      throw new Error(
        `Expected single value metadata for value '${value}', got ${JSON.stringify(valueMetadata)}`,
      );
    }

    const dataTypeId = valueMetadata.metadata.dataTypeId;

    if (!dataTypeId) {
      throw new Error("Expected a dataTypeId to be set on the value metadata");
    }

    const dataType = Array.isArray(dataTypePool)
      ? dataTypePool.find((type) => type.schema.$id === dataTypeId)
      : dataTypePool[dataTypeId];

    if (!dataType) {
      throw new Error(
        "Expected a data type to be set on the value or at least one permitted data type",
      );
    }

    const schema = getMergedDataTypeSchema(dataType.schema);

    if ("anyOf" in schema) {
      throw new Error(
        "Data types with different expected sets of constraints (anyOf) are not yet supported",
      );
    }

    valueParts.push(...formatDataValue(value as JsonValue, schema));
  }

  return valueParts;
};
