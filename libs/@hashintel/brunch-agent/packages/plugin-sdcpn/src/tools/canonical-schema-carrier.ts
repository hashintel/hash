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
 * Carry the JSON Schema vocabulary exercised by addType, not a second copy of
 * Petrinaut's fields. New keywords fail closed until their carriage is proved.
 * Canonical Zod validation remains the authority at execution.
 */
const schemaCarrier = (schema: CanonicalSchema): v.GenericSchema => {
  const supportedKeywords = new Set(["$schema", "description"]);
  const consumes = (...keywords: string[]) => {
    for (const keyword of keywords) supportedKeywords.add(keyword);
  };
  let carrier: v.GenericSchema;
  if (schema.anyOf) {
    consumes("anyOf");
    carrier = v.union(
      schema.anyOf.map((option) => {
        if (typeof option === "boolean")
          throw new Error("Boolean schemas are not carried");
        return schemaCarrier(option);
      }),
    );
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
      case "string":
        consumes("minLength");
        carrier =
          schema.minLength === undefined
            ? v.string()
            : v.pipe(v.string(), v.minLength(schema.minLength));
        break;
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
