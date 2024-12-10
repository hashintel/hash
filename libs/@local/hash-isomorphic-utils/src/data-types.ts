import type { JsonValue } from "@blockprotocol/core";
import type {
  ClosedDataType,
  NumberConstraints,
  SingleValueConstraints,
  SingleValueSchema,
  StringConstraints,
  ValueLabel,
} from "@blockprotocol/type-system";
import { mustHaveAtLeastOne } from "@blockprotocol/type-system";

type MergedNumberSchema = {
  type: "number";
  const?: number;
  enum?: number[];
} & Omit<NumberConstraints, "multipleOf"> & { multipleOf?: number[] };

type MergedStringSchema = {
  type: "string";
  const?: string;
  enum?: string[];
} & Omit<StringConstraints, "pattern"> & { pattern?: string[] };

type ObjectSchema = { type: "object" };

type NullSchema = { type: "null" };

type BooleanSchema = { type: "boolean" };

type TupleSchema = {
  prefixItems: [MergedDataTypeSingleSchema, ...MergedDataTypeSingleSchema[]];
  items: false;
};

type ListSchema = {
  items: MergedDataTypeSingleSchema;
};

type ArraySchema = { type: "array" } & (TupleSchema | ListSchema);

export type MergedValueSchema =
  | MergedNumberSchema
  | MergedStringSchema
  | ObjectSchema
  | NullSchema
  | BooleanSchema
  | ArraySchema;

export type MergedDataTypeSingleSchema = {
  description: string;
  label?: ValueLabel;
} & MergedValueSchema;

export type MergedDataTypeSchema =
  | MergedDataTypeSingleSchema
  | { anyOf: MergedDataTypeSingleSchema[] };

export type FormattedValuePart = {
  color: string;
  type: "leftLabel" | "rightLabel" | "value";
  text: string;
};

const createFormattedParts = ({
  inner,
  schema,
}: {
  inner: string | FormattedValuePart[];
  schema?: Pick<SingleValueSchema, "label">;
}): FormattedValuePart[] => {
  const { left = "", right = "" } = schema?.label ?? {};

  const parts: FormattedValuePart[] = [];

  if (left) {
    parts.push({ color: "#91A5BA", type: "leftLabel", text: left });
  }

  if (Array.isArray(inner)) {
    parts.push(...inner);
  } else {
    parts.push({ color: "#37434F", type: "value", text: inner });
  }

  if (right) {
    parts.push({ color: "#91A5BA", type: "rightLabel", text: right });
  }

  return parts;
};

export const formatDataValue = (
  value: JsonValue,
  schema: MergedDataTypeSingleSchema,
): FormattedValuePart[] => {
  const { type } = schema;

  if (type === "null") {
    return createFormattedParts({ inner: "Null", schema });
  }

  if (type === "boolean") {
    return createFormattedParts({ inner: value ? "True" : "False", schema });
  }

  if (type === "array") {
    if (!Array.isArray(value)) {
      throw new Error("Non-array value provided for array data type");
    }

    const isTuple = "prefixItems" in schema;

    const innerValue: string = value
      .map((inner, index) => {
        if (isTuple) {
          const itemSchema = schema.prefixItems[index];

          if (!itemSchema) {
            throw new Error(
              `No schema for tuple item at index ${index} – value has too many items`,
            );
          }

          return formatDataValue(inner, schema.prefixItems[index]!);
        }

        return formatDataValue(inner, schema.items);
      })
      .join("");

    return formatDataValue(innerValue, schema);
  }

  if (typeof value === "object" && value) {
    return createFormattedParts({ inner: JSON.stringify(value), schema });
  }

  return createFormattedParts({ inner: String(value), schema });
};

const transformConstraint = (
  constraint: SingleValueConstraints & {
    description: string;
    label?: ValueLabel;
  },
): MergedDataTypeSingleSchema => {
  const { description, label, type } = constraint;

  if (type === "string") {
    if ("enum" in constraint || "const" in constraint) {
      return constraint;
    }

    return {
      ...constraint,
      pattern: constraint.pattern ? [constraint.pattern] : undefined,
    };
  }
  if (type === "number") {
    if ("enum" in constraint || "const" in constraint) {
      return constraint;
    }

    return {
      ...constraint,
      multipleOf: constraint.multipleOf ? [constraint.multipleOf] : undefined,
    };
  }

  if (type === "array") {
    if ("prefixItems" in constraint) {
      if (!constraint.prefixItems) {
        throw new Error("Expected prefixItems to be defined");
      }

      return {
        ...constraint,
        prefixItems: mustHaveAtLeastOne(
          constraint.prefixItems.map((tupleItem) =>
            transformConstraint({ description, label, ...tupleItem }),
          ),
        ),
        items: false,
      };
    }

    if ("items" in constraint || !constraint.items) {
      throw new Error("Expected items to be defined");
    }

    return {
      ...constraint,
      items: transformConstraint({ description, label, ...constraint.items }),
    };
  }

  return constraint;
};

export const getMergedDataTypeSchema = (
  dataType: ClosedDataType,
): MergedDataTypeSchema => {
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
      anyOf.push(transformConstraint({ description, label, ...option }));
    }

    if (!anyOf[0]) {
      throw new Error("Expected anyOf to have at least one constraint");
    }

    return { anyOf };
  }

  const mergedSchema: MergedDataTypeSchema = transformConstraint({
    description,
    label,
    ...firstOption,
  });

  if (
    mergedSchema.type === "object" ||
    mergedSchema.type === "array" ||
    mergedSchema.type === "null" ||
    mergedSchema.type === "boolean"
  ) {
    return mergedSchema;
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

  return mergedSchema;
};
