import * as v from "valibot";

import type { petrinautAiTools } from "@hashintel/petrinaut-core/ai";

type CanonicalSchema = Exclude<
  NonNullable<
    ReturnType<
      (typeof petrinautAiTools)["addType"]["inputSchema"]["toJSONSchema"]
    >["properties"]
  >[string],
  boolean
>;

/**
 * Carry the locally proved canonical vocabulary, not a second copy of Petrinaut's
 * fields. Mechanical support does not grant tool admission. New keywords fail closed.
 * Canonical Zod validation remains the authority at execution.
 */
const schemaCarrier = (schema: CanonicalSchema): v.GenericSchema => {
  const supportedKeywords = new Set(["$schema", "description"]);
  const consumes = (...keywords: string[]) => {
    for (const keyword of keywords) supportedKeywords.add(keyword);
  };
  let carrier: v.GenericSchema;
  if (schema.oneOf) {
    consumes("oneOf");
    const options = schema.oneOf.map((option) => {
      if (
        typeof option === "boolean" ||
        option.type !== "object" ||
        !option.properties ||
        option.additionalProperties !== false
      )
        throw new Error(
          "Unsupported oneOf: expected closed object alternatives",
        );
      return option;
    });
    // A shared, required, distinct string constant proves that alternatives cannot
    // overlap. Valibot variant is not a general exactly-one validator.
    const discriminator = options[0]?.required?.find((key) => {
      const values = options.map((option) => {
        const property = option.properties?.[key];
        return option.required?.includes(key) &&
          property &&
          typeof property !== "boolean" &&
          property.type === "string" &&
          typeof property.const === "string"
          ? property.const
          : undefined;
      });
      return (
        values.every((value) => value !== undefined) &&
        new Set(values).size === options.length
      );
    });
    if (discriminator === undefined) {
      throw new Error(
        "Unsupported oneOf: no disjoint required string discriminator",
      );
    }
    carrier = v.variant(
      discriminator,
      options.map(
        (option) =>
          // Each checked alternative is a closed object; recursive validation below
          // still rejects unsupported siblings, including on the discriminator.
          schemaCarrier(option) as v.StrictObjectSchema<
            v.ObjectEntries,
            undefined
          >,
      ),
    );
  } else if (schema.anyOf) {
    consumes("anyOf");
    carrier = v.union(
      schema.anyOf.map((option) => {
        if (typeof option === "boolean")
          throw new Error("Boolean schemas are not carried");
        return schemaCarrier(option);
      }),
    );
  } else if ("const" in schema) {
    consumes("type", "const");
    if (schema.type !== "string" || typeof schema.const !== "string") {
      throw new Error(
        "Unsupported const: only typed string constants are carried",
      );
    }
    // literal() exports const alone. value() retains the canonical type as well.
    carrier = v.pipe(v.string(), v.value(schema.const));
  } else if (schema.enum) {
    consumes("type", "enum");
    if (
      schema.type !== "string" ||
      !schema.enum.every(
        (option): option is string => typeof option === "string",
      )
    ) {
      throw new Error("Only string enums are carried");
    }
    carrier = v.picklist(schema.enum);
  } else {
    consumes("type");
    switch (schema.type) {
      case "object": {
        consumes("properties", "required", "additionalProperties");
        if (!schema.properties || schema.additionalProperties !== false) {
          throw new Error("Only closed canonical objects are carried");
        }
        const required = new Set(schema.required ?? []);
        if (
          [...required].some((name) => !Object.hasOwn(schema.properties!, name))
        ) {
          throw new Error("Unsupported required property without a schema");
        }
        const entries: v.ObjectEntries = Object.fromEntries(
          Object.entries(schema.properties).map(([name, property]) => {
            if (typeof property === "boolean")
              throw new Error("Boolean schemas are not carried");
            const entry = schemaCarrier(property);
            return [name, required.has(name) ? entry : v.optional(entry)];
          }),
        );
        carrier = v.strictObject(entries);
        break;
      }
      case "array":
        consumes("items");
        if (
          !schema.items ||
          typeof schema.items === "boolean" ||
          Array.isArray(schema.items)
        ) {
          throw new Error("Only homogeneous canonical arrays are carried");
        }
        carrier = v.array(schemaCarrier(schema.items));
        break;
      case "string": {
        consumes("minLength", "maxLength");
        let text: v.GenericSchema<string> = v.string();
        if (schema.minLength !== undefined)
          text = v.pipe(text, v.minLength(schema.minLength));
        if (schema.maxLength !== undefined)
          text = v.pipe(text, v.maxLength(schema.maxLength));
        carrier = text;
        break;
      }
      case "boolean":
        carrier = v.boolean();
        break;
      case "number":
      case "integer": {
        consumes("minimum", "maximum", "exclusiveMinimum");
        // JSON numbers are finite; Valibot number() alone also accepts Infinity.
        let numeric: v.GenericSchema<number> = v.pipe(v.number(), v.finite());
        if (schema.type === "integer") numeric = v.pipe(numeric, v.integer());
        if (schema.minimum !== undefined)
          numeric = v.pipe(numeric, v.minValue(schema.minimum));
        if (schema.maximum !== undefined)
          numeric = v.pipe(numeric, v.maxValue(schema.maximum));
        if (schema.exclusiveMinimum !== undefined) {
          if (typeof schema.exclusiveMinimum !== "number") {
            throw new Error("Unsupported non-numeric exclusiveMinimum");
          }
          numeric = v.pipe(numeric, v.gtValue(schema.exclusiveMinimum));
        }
        carrier = numeric;
        break;
      }
      case "null":
        carrier = v.null();
        break;
      default:
        throw new Error(
          `Unsupported canonical schema type: ${String(schema.type)}`,
        );
    }
  }
  for (const keyword of Object.keys(schema)) {
    if (!supportedKeywords.has(keyword)) {
      throw new Error(`Unsupported canonical schema keyword: ${keyword}`);
    }
  }
  return schema.description === undefined
    ? carrier
    : v.pipe(carrier, v.description(schema.description));
};

export const canonicalSchemaCarrier = (schema: CanonicalSchema) => {
  if (schema.type !== "object") throw new Error("Tool input must be an object");
  // The root check above narrows the generic recursive carrier's input, as
  // required by Flue's ToolInputSchema. Nested schemas need not be objects.
  return schemaCarrier(schema) as v.GenericSchema<Record<string, unknown>>;
};
