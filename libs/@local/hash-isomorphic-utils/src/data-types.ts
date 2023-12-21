import { JsonValue } from "@blockprotocol/core";
import { VersionedUrl } from "@blockprotocol/type-system";
import { Subtype } from "@local/advanced-types/subtype";
import { DataType } from "@local/hash-graph-client";
import { DistributiveOmit } from "@local/hash-isomorphic-utils/util";

/**
 * Non-exhaustive list of possible values for 'format'
 *
 * The presence of a format in this list does _NOT_ mean that:
 * 1. The Graph will validate it
 * 2. The frontend will treat it differently for input or display
 *
 * @see https://json-schema.org/understanding-json-schema/reference/string
 */
type StringFormat =
  | "date"
  | "time"
  | "date-time"
  | "duration"
  | "email"
  | "hostname"
  | "ipv4"
  | "ipv6"
  | "regex"
  | "uri"
  | "uuid";

export type StringConstraint = {
  format?: StringFormat;
  minLength?: number; // Int
  maxLength?: number; // Int
  pattern?: string; // RegExp
  type: "string";
};

export type NumberConstraint = {
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  multipleOf?: number;
  type: "number" | "integer";
};

export type BooleanConstraint = {
  type: "boolean";
};

export type NullConstraint = {
  type: "null";
};

export type ObjectConstraint = {
  type: "object";
};

export type StringEnumConstraint = {
  enum: string[];
  type: "string";
};

export type NumberEnumConstraint = {
  enum: number[];
  type: "number" | "integer";
};

/** @see https://json-schema.org/understanding-json-schema/reference/enum */
export type EnumConstraint = StringEnumConstraint | NumberEnumConstraint;

export type StringConstConstraint = {
  const: string;
  type: "string";
};

export type NumberConstConstraint = {
  const: number;
  type: "number" | "integer";
};

export type ConstConstraint = StringConstConstraint | NumberConstConstraint;

type ValueLabel = {
  left?: string;
  right?: string;
};

export type SingleValueConstraint =
  | BooleanConstraint
  | NullConstraint
  | ObjectConstraint
  | StringConstraint
  | NumberConstraint
  | EnumConstraint
  | ConstConstraint;

export type ArrayConstraint = {
  type: "array";
  items: ValueConstraint;
};

/** @see https://json-schema.org/understanding-json-schema/reference/array#tuple-validation */
export type TupleConstraint = {
  type: "array";
  items: false; // disallow additional items;
  prefixItems: ValueConstraint[];
};

export type ValueConstraint = (
  | SingleValueConstraint
  | ArrayConstraint
  | TupleConstraint
) & { description?: string; label?: ValueLabel };

export type CustomDataType = Subtype<
  DataType,
  {
    description?: string;
    $id: VersionedUrl;
    kind: "dataType";
    $schema: "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type";
    title: string;
  } & ValueConstraint
>;

export type ConstructDataTypeParams = DistributiveOmit<
  CustomDataType,
  "$id" | "kind" | "$schema"
>;

export type FormattedValuePart = {
  color: string;
  type: "label" | "value";
  text: string;
};

const createFormattedParts = ({
  inner,
  schema,
}: {
  inner: string | FormattedValuePart[];
  schema: Pick<ValueConstraint, "label"> | null;
}): FormattedValuePart[] => {
  const { left = "", right = "" } = schema?.label ?? {};

  const parts: FormattedValuePart[] = [];

  if (left) {
    parts.push({ color: "#91A5BA", type: "label", text: left });
  }

  if (Array.isArray(inner)) {
    parts.push(...inner);
  } else {
    parts.push({ color: "#37434F", type: "value", text: inner });
  }

  if (right) {
    parts.push({ color: "#91A5BA", type: "label", text: right });
  }

  return parts;
};

export const getJsonSchemaTypeFromValue = (
  value: unknown,
): DataType["type"] => {
  if (value === null) {
    return "null";
  }

  if (Array.isArray(value)) {
    return "array";
  }

  switch (typeof value) {
    case "number":
    case "bigint":
      return "number";
    default:
      return typeof value;
  }
};

export const formatDataValue = (
  value: JsonValue,
  schema: ValueConstraint | null,
): FormattedValuePart[] => {
  const { type } = schema ?? {
    type: getJsonSchemaTypeFromValue(value),
  };

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

    if (schema && !("items" in schema)) {
      // Handle the Empty List, which is a const [] with no 'items'
      return [
        {
          color: "#37434F",
          type: "value",
          text: "Empty List",
        },
      ];
    }

    const isTuple = schema && "prefixItems" in schema;

    const innerValue: string = value
      .map((inner, index) => {
        if (isTuple && index < schema.prefixItems.length) {
          return formatDataValue(inner, schema.prefixItems[index]!);
        }

        if (schema && !schema.items) {
          // schema.items is false for tuple types (specifying that additional items are not allowed)
          throw new Error(
            "Expected 'items' schema in non-tuple array data type",
          );
        }

        return formatDataValue(inner, schema?.items ?? null);
      })
      .join("");

    return formatDataValue(innerValue, schema);
  }

  if (typeof value === "object" && value) {
    return createFormattedParts({ inner: JSON.stringify(value), schema });
  }

  return createFormattedParts({ inner: String(value), schema });
};
