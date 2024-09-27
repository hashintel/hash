import type { JsonValue } from "@blockprotocol/core";
import type { DataType, SimpleValueSchema } from "@blockprotocol/type-system";
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
  schema?: Pick<DataType, "label">;
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
  schema?: DataType | SimpleValueSchema,
): FormattedValuePart[] => {
  /**
   * @todo H-3374 callers should always provide a schema, because the dataTypeId will be in the entity's metadata
   */
  const type =
    schema && "type" in schema
      ? schema.type
      : getJsonSchemaTypeFromValue(value);

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
        if (
          isTuple &&
          schema.prefixItems &&
          index < schema.prefixItems.length
        ) {
          return formatDataValue(inner, schema.prefixItems[index]);
        }

        if (schema && !schema.items) {
          // schema.items is false for tuple types (specifying that additional items are not allowed)
          throw new Error(
            "Expected 'items' schema in non-tuple array data type",
          );
        }

        return formatDataValue(inner, schema?.items);
      })
      .join("");

    return formatDataValue(innerValue, schema);
  }

  if (typeof value === "object" && value) {
    return createFormattedParts({ inner: JSON.stringify(value), schema });
  }

  return createFormattedParts({ inner: String(value), schema });
};
