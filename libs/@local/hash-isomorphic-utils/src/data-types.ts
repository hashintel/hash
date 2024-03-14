import type { JsonValue } from "@blockprotocol/core";
import type { ValueConstraint } from "@local/hash-subgraph";
import { getJsonSchemaTypeFromValue } from "@local/hash-subgraph/stdlib";

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
  schema: Pick<ValueConstraint, "label"> | null;
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
