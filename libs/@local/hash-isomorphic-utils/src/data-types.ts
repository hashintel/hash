import type { JsonValue } from "@blockprotocol/core";
import type {
  ClosedDataType,
  ConversionDefinition,
  ConversionExpression,
  ConversionValue,
  DataType,
  NumberConstraints,
  SingleValueConstraints,
  SingleValueSchema,
  StringConstraints,
  ValueLabel,
  VersionedUrl,
} from "@blockprotocol/type-system";
import { mustHaveAtLeastOne } from "@blockprotocol/type-system";
import type { ClosedDataTypeDefinition } from "@local/hash-graph-sdk/ontology";
import Big from "big.js";

import { add, divide, multiply, subtract } from "./numbers.js";

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

export const createFormattedValueParts = ({
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

const arrayItemSeparator: FormattedValuePart = {
  color: "#758AA1",
  type: "rightLabel",
  text: ", ",
};

export const formatDataValue = (
  value: JsonValue,
  schema: MergedDataTypeSingleSchema,
): FormattedValuePart[] => {
  const { type } = schema;

  if (type === "null") {
    return createFormattedValueParts({ inner: "Null", schema });
  }

  if (type === "boolean") {
    return createFormattedValueParts({
      inner: value ? "True" : "False",
      schema,
    });
  }

  if (type === "array") {
    if (!Array.isArray(value)) {
      throw new Error("Non-array value provided for array data type");
    }

    const isTuple = "prefixItems" in schema;

    return value.flatMap((inner, index) => {
      if (isTuple) {
        const itemSchema = schema.prefixItems[index];

        if (!itemSchema) {
          throw new Error(
            `No schema for tuple item at index ${index} – value has too many items`,
          );
        }

        const innerValue = formatDataValue(inner, itemSchema);

        if (index < innerValue.length - 1) {
          return [arrayItemSeparator, ...innerValue];
        }

        return innerValue;
      }

      const innerValue = formatDataValue(inner, schema.items);

      if (index < value.length - 1) {
        return [arrayItemSeparator, ...innerValue];
      }

      return innerValue;
    });
  }

  if (typeof value === "object" && value) {
    return createFormattedValueParts({ inner: JSON.stringify(value), schema });
  }

  return createFormattedValueParts({ inner: String(value), schema });
};

type Context = {
  self: Big;
};

const evaluateConversionValue = (
  value: ConversionValue,
  context: Context,
): Big => {
  if (Array.isArray(value)) {
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    return evaluateExpression(value, context);
  } else if (value === "self") {
    return context.self;
  } else {
    return new Big(value.const);
  }
};

const evaluateExpression = (
  expression: ConversionExpression,
  context: Context,
): Big => {
  const left = evaluateConversionValue(expression[1], context);
  const right = evaluateConversionValue(expression[2], context);

  switch (expression[0]) {
    case "+":
      return add(left, right);
    case "-":
      return subtract(left, right);
    case "*":
      return multiply(left, right);
    case "/":
      if (right.eq(0)) {
        return new Big(0);
      }
      return divide(left, right);
  }
};

export const createConversionFunction = (
  conversions: ConversionDefinition[],
): ((value: number) => number) => {
  return (value: number) => {
    let evaluatedValue = new Big(value);

    for (const conversion of conversions) {
      evaluatedValue = evaluateExpression(conversion.expression, {
        self: evaluatedValue,
      });
    }

    return evaluatedValue.toNumber();
  };
};

const transformConstraint = (
  constraint: SingleValueConstraints & {
    description: string;
    label?: ValueLabel;
  },
): MergedDataTypeSingleSchema => {
  const { description, label, type } = constraint;

  if (type === "string") {
    if ("enum" in constraint) {
      return constraint;
    }

    return {
      ...constraint,
      pattern: constraint.pattern ? [constraint.pattern] : undefined,
    };
  }
  if (type === "number") {
    if ("enum" in constraint) {
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

const isDataType = (
  dataType: DataType | ClosedDataTypeDefinition,
): dataType is DataType => {
  return "$id" in dataType;
};

/**
 * Get all permitted data types for a value, which are the targetDataTypes or their descendants.
 * Excludes `abstract` types.
 *
 * The data type pool must include all children of the targetDataTypes, which can be fetched from the API via one of:
 * - fetching all data types:
 *     e.g. in the context of the type editor, where all types are selectable)
 * - making a query for an entityType with the 'resolvedWithDataTypeChildren' resolution method
 *     e.g. when selecting a value valid for specific entity types, and having the API resolve the valid data types
 */
export const getPermittedDataTypes = <
  T extends ClosedDataTypeDefinition | DataType,
>({
  targetDataTypes,
  dataTypePoolById,
}: {
  /**
   * The data types that the user is allowed to select
   * – does not need to include children, but they should appear in the dataTypePool.
   */
  targetDataTypes: T[];
  /**
   * The pool to find the permitted data types for selection from.
   * This MUST include targetDataTypes and any children of targetDataTypes
   * It MAY include other data types which are not selectable (e.g. parents of targetDataTypes, or
   * unrelated types). Unselectable types will not be included in the results
   */
  dataTypePoolById: Record<VersionedUrl, T>;
}): T[] => {
  const directChildrenByDataTypeId: Record<VersionedUrl, T[]> = {};

  /**
   * First, we need to know the children of all data types. Data types store references to their parents, not children.
   * The selectable types are either targets or children of targets.
   */
  for (const dataType of Object.values(dataTypePoolById)) {
    const directParents = isDataType(dataType)
      ? (dataType.allOf?.map(({ $ref }) => $ref) ?? [])
      : dataType.parents;

    for (const parent of directParents) {
      directChildrenByDataTypeId[parent] ??= [];

      const parentDataType = dataTypePoolById[parent];

      if (parentDataType) {
        /**
         * If the parentDataType is not in the pool, it is not a selectable parent.
         * The caller is responsible for ensuring that the pool contains all selectable data types,
         * via one of the methods described in the function's JSDoc.
         */
        directChildrenByDataTypeId[parent].push(dataType);
      }
    }
  }

  const permittedDataTypes: T[] = [];

  const stack: T[] = [...targetDataTypes];
  while (stack.length > 0) {
    const current = stack.pop()!;

    const abstract = isDataType(current)
      ? current.abstract
      : current.schema.abstract;

    if (!abstract) {
      permittedDataTypes.push(current);
    }

    const $id = isDataType(current) ? current.$id : current.schema.$id;

    const children = directChildrenByDataTypeId[$id];
    if (children) {
      stack.push(...children);
    }
  }

  return permittedDataTypes;
};
