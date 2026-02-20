import type { JsonValue } from "@blockprotocol/core";
import type { PropertyMetadata } from "@blockprotocol/type-system";
import {
  isArrayMetadata,
  isObjectMetadata,
  isValueMetadata,
} from "@blockprotocol/type-system";
import { customColors } from "@hashintel/design-system/theme";
import type {
  ClosedDataTypeDefinition,
  ClosedMultiEntityTypesDefinitions,
} from "@local/hash-graph-sdk/ontology";
import {
  createFormattedValueParts,
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
        if (isArrayMetadata(arrayItemMetadata)) {
          throw new Error(
            `Nested arrays are not currently supported in this display`,
          );
        }

        if (!isObjectMetadata(arrayItemMetadata)) {
          throw new Error(
            `Expected single value metadata for array item at index ${index} in value '${JSON.stringify(value)}', got ${JSON.stringify(arrayItemMetadata)}`,
          );
        }
      }

      if (isObjectMetadata(arrayItemMetadata)) {
        valueParts.push(
          ...createFormattedValueParts({
            inner: JSON.stringify(entry),
          }),
        );
        continue;
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
        /**
         * @todo H-4067: Support anyOf constraints (e.g. data types which can be 'string' or 'number')
         */
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
      /**
       * @todo H-4067: Support anyOf constraints (e.g. data types which can be 'string' or 'number')
       */
      throw new Error(
        "Data types with different expected sets of constraints (anyOf) are not yet supported",
      );
    }

    valueParts.push(...formatDataValue(value as JsonValue, schema));
  }

  return valueParts;
};
