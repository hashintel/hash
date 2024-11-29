import type {
  ClosedDataType,
  SingleValueConstraints,
} from "@blockprotocol/type-system/slim";
import type { PropertyValue } from "@local/hash-graph-types/entity";

import type {
  EditorType,
  MergedDataTypeSchema,
  MergedDataTypeSingleSchema,
  MergedValueSchema,
} from "./types";

const transformConstraint = (
  constraint: SingleValueConstraints,
): MergedValueSchema => {
  if ("const" in constraint) {
    return { const: constraint.const };
  }
  if ("enum" in constraint) {
    return { enum: constraint.enum };
  }
  if (constraint.type === "string") {
    return {
      ...constraint,
      pattern: constraint.pattern ? [constraint.pattern] : undefined,
    };
  }
  if (constraint.type === "number") {
    return {
      ...constraint,
      multipleOf: constraint.multipleOf ? [constraint.multipleOf] : undefined,
    };
  }
  return constraint;
};

const getEditorTypeFromValue = (value: unknown): EditorType => {
  const type = typeof value;
  if (
    type === "bigint" ||
    type === "symbol" ||
    type === "function" ||
    type === "undefined"
  ) {
    throw new Error(`Unsupported data type: ${type}`);
  }
  return type;
};

export const getMergedDataTypeSchema = (
  dataType: ClosedDataType,
): { editorType: EditorType; schema: MergedDataTypeSchema } => {
  const { description, label } = dataType;

  const firstOption = dataType.allOf[0];

  if ("anyOf" in firstOption) {
    if (dataType.allOf.length > 1) {
      /**
       * We assume that the Graph API has reduced the constraints to a single anyOf array when closing the data type
       */
      throw new Error("Expected data type to have a single anyOf constraint.");
    }

    const anyOf: MergedDataTypeSingleSchema[] = [];

    for (const option of firstOption.anyOf) {
      anyOf.push({
        description: option.description ?? description,
        label: option.label ?? label,
        ...transformConstraint(option),
      });
    }

    if (!anyOf[0]) {
      throw new Error("Expected anyOf to have at least one constraint");
    }

    const typeSet = new Set(
      anyOf.flatMap((option) =>
        "type" in option
          ? option.type
          : "const" in option
            ? getEditorTypeFromValue(option.const)
            : option.enum.map((value) => getEditorTypeFromValue(value)),
      ),
    );

    if (typeSet.size === 1) {
      const type = typeSet.values().next().value!;

      return { editorType: type, schema: { anyOf } };
    }

    return { editorType: "mixed", schema: { anyOf } };
  }

  const mergedSchema: MergedDataTypeSchema = {
    description,
    label,
    ...transformConstraint(firstOption),
  };

  if (
    "const" in mergedSchema ||
    "enum" in mergedSchema ||
    mergedSchema.type === "object" ||
    mergedSchema.type === "array" ||
    mergedSchema.type === "null" ||
    mergedSchema.type === "boolean"
  ) {
    let type: EditorType | undefined;
    if ("const" in mergedSchema) {
      type = getEditorTypeFromValue(mergedSchema.const);
    } else if ("enum" in mergedSchema) {
      const types = new Set(
        mergedSchema.enum.map((value) => getEditorTypeFromValue(value)),
      );

      if (types.size === 1) {
        type = types.values().next().value!;
      }
    } else {
      type = mergedSchema.type;
    }

    return {
      editorType: type!,
      schema: mergedSchema,
    };
  }

  /**
   * If dealing with a string or number, we need to collect all the 'pattern' and 'multipleOf' constraints,
   * because the Graph API does not merge them into a single object.
   * We could later deal with this at the Graph level by:
   * 1. Merging all 'pattern' fields into a single RegExp, or having ClosedDataType have an array for 'pattern'
   * 2. Having an array for 'multipleOf' on ClosedDataType
   */
  for (const option of dataType.allOf.slice(1)) {
    if ("anyOf" in option) {
      throw new Error("Expected data type to have a single anyOf constraint.");
    }

    if (mergedSchema.type === "string") {
      if (option.type !== "string") {
        throw new Error(
          `Mixed primitive data types for data type: ${dataType.$id}`,
        );
      }
      mergedSchema.pattern ??= [];
      if ("pattern" in option && option.pattern) {
        mergedSchema.pattern.push(option.pattern);
      }
    } else {
      if (option.type !== "number") {
        throw new Error(
          `Mixed primitive data types for data type: ${dataType.$id}`,
        );
      }
      mergedSchema.multipleOf ??= [];
      if ("multipleOf" in option && option.multipleOf) {
        mergedSchema.multipleOf.push(option.multipleOf);
      }
    }
  }

  return {
    editorType: mergedSchema.type,
    schema: mergedSchema,
  };
};

export const getEditorTypeFromTypeAndValue = (
  value: PropertyValue,
  dataType: ClosedDataType,
): {
  editorType: EditorType;
  constraints: MergedDataTypeSingleSchema;
} => {
  const { editorType, schema } = getMergedDataTypeSchema(dataType);

  if (!("anyOf" in schema)) {
    return {
      editorType,
      constraints: schema,
    };
  }

  /**
   * @todo use a JSON schema validator to see if value matches constraints
   */
  for (const option of schema.anyOf) {
    if ("const" in option) {
      if (value === option.const) {
        return { editorType: "const", constraints: option };
      }
    }
    if ("enum" in option) {
      if (option.enum.includes(value as string | number)) {
        return { editorType: "enum", constraints: option };
      }
    }

    switch (option.type) {
      case "const": {
        if (value === option.const) {
          return { editorType: "const", constraints: option };
        }
        break;
      }
      case "enum": {
        if (option.enum.includes(value as string | number)) {
          return { editorType: "enum", constraints: option };
        }
        break;
      }
      case "string": {
        if (typeof value !== "string") {
          break;
        }

        const minLength = option.minLength ?? 0;
        const maxLength = option.maxLength ?? Infinity;

        const regExps = option.pattern?.map((pattern) => new RegExp(pattern));

        if (
          value.length >= minLength &&
          value.length <= maxLength &&
          (!regExps || regExps.every((regExp) => regExp.test(value)))
        ) {
          return { editorType: "string", constraints: option };
        }
        break;
      }
      case "number": {
        if (typeof value !== "number") {
          break;
        }

        const minimum = option.minimum ?? -Infinity;
        const maximum = option.maximum ?? Infinity;
        const exclusiveMinimum = option.exclusiveMinimum ?? false;
        const exclusiveMaximum = option.exclusiveMaximum ?? false;
        const multipleOfs = option.multipleOf ?? [];

        if (
          (exclusiveMinimum ? value > minimum : value >= minimum) &&
          (exclusiveMaximum ? value < maximum : value <= maximum) &&
          multipleOfs.every((multipleOf) => value % multipleOf === 0)
        ) {
          return { editorType: "number", constraints: option };
        }
        break;
      }
      case "boolean":
        if (typeof value === "boolean") {
          return { editorType: "boolean", constraints: option };
        }
        break;
      case "null":
        if (value === null) {
          return { editorType: "null", constraints: option };
        }
        break;
      case "object": {
        if (typeof value === "object" && value !== null) {
          return { editorType: "object", constraints: option };
        }
        break;
      }
      case "array": {
        throw new Error("Array editor type not supported");
      }
    }
  }

  throw new Error(`Could not find matching constraint for value`);
};

export const isBlankStringOrNullish = (value: unknown) => {
  const isBlankString = typeof value === "string" && !value.trim().length;
  return isBlankString || value === null || value === undefined;
};
