import * as v from "valibot";

type JsonSchemaObject = {
  readonly additionalProperties?: boolean;
  readonly anyOf?: readonly unknown[];
  readonly const?: unknown;
  readonly description?: string;
  readonly enum?: readonly unknown[];
  readonly exclusiveMaximum?: number;
  readonly exclusiveMinimum?: number;
  readonly items?: unknown;
  readonly maximum?: number;
  readonly minimum?: number;
  readonly minLength?: number;
  readonly oneOf?: readonly unknown[];
  readonly properties?: Readonly<Record<string, unknown>>;
  readonly required?: readonly string[];
  readonly type?: string;
};

const schemaObjectFrom = (schema: unknown): JsonSchemaObject => {
  if (typeof schema !== "object" || schema === null || Array.isArray(schema)) {
    throw new Error("Canonical Petrinaut JSON Schema must contain an object.");
  }
  return schema as JsonSchemaObject;
};

const literalFrom = (value: unknown): v.Literal => {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  throw new Error(
    `Unsupported canonical JSON Schema literal: ${JSON.stringify(value)}`,
  );
};

const unionFrom = (
  alternatives: readonly unknown[],
): v.GenericSchema<unknown> => {
  const schemas = alternatives.map(schemaFrom);
  const firstSchema = schemas.at(0);
  if (firstSchema === undefined) {
    throw new Error("Canonical JSON Schema unions must not be empty.");
  }
  if (schemas.length === 1) return firstSchema;
  return v.union(schemas as v.UnionOptions);
};

const stringSchemaFrom = (schema: JsonSchemaObject): v.GenericSchema<unknown> =>
  schema.minLength === undefined
    ? v.string()
    : v.pipe(v.string(), v.minLength(schema.minLength));

const numberSchemaFrom = (
  schema: JsonSchemaObject,
  integer: boolean,
): v.GenericSchema<unknown> => {
  if (schema.minimum !== undefined && schema.exclusiveMinimum !== undefined) {
    throw new Error(
      "Canonical JSON Schema numbers cannot have two minimum constraints.",
    );
  }
  if (schema.maximum !== undefined && schema.exclusiveMaximum !== undefined) {
    throw new Error(
      "Canonical JSON Schema numbers cannot have two maximum constraints.",
    );
  }

  const baseSchema = integer ? v.pipe(v.number(), v.integer()) : v.number();
  if (schema.minimum !== undefined && schema.maximum !== undefined) {
    return v.pipe(
      baseSchema,
      v.minValue(schema.minimum),
      v.maxValue(schema.maximum),
    );
  }
  if (schema.minimum !== undefined && schema.exclusiveMaximum !== undefined) {
    return v.pipe(
      baseSchema,
      v.minValue(schema.minimum),
      v.ltValue(schema.exclusiveMaximum),
    );
  }
  if (schema.exclusiveMinimum !== undefined && schema.maximum !== undefined) {
    return v.pipe(
      baseSchema,
      v.gtValue(schema.exclusiveMinimum),
      v.maxValue(schema.maximum),
    );
  }
  if (
    schema.exclusiveMinimum !== undefined &&
    schema.exclusiveMaximum !== undefined
  ) {
    return v.pipe(
      baseSchema,
      v.gtValue(schema.exclusiveMinimum),
      v.ltValue(schema.exclusiveMaximum),
    );
  }
  if (schema.minimum !== undefined) {
    return v.pipe(baseSchema, v.minValue(schema.minimum));
  }
  if (schema.exclusiveMinimum !== undefined) {
    return v.pipe(baseSchema, v.gtValue(schema.exclusiveMinimum));
  }
  if (schema.maximum !== undefined) {
    return v.pipe(baseSchema, v.maxValue(schema.maximum));
  }
  if (schema.exclusiveMaximum !== undefined) {
    return v.pipe(baseSchema, v.ltValue(schema.exclusiveMaximum));
  }
  return baseSchema;
};

const objectSchemaFrom = (
  schema: JsonSchemaObject,
): v.GenericSchema<unknown> => {
  const required = new Set(schema.required ?? []);
  const entries: v.ObjectEntries = {};
  for (const [key, propertySchema] of Object.entries(schema.properties ?? {})) {
    const entrySchema = schemaFrom(propertySchema);
    entries[key] = required.has(key) ? entrySchema : v.optional(entrySchema);
  }
  return schema.additionalProperties === false
    ? v.strictObject(entries)
    : v.looseObject(entries);
};

const baseSchemaFrom = (schema: JsonSchemaObject): v.GenericSchema<unknown> => {
  if (schema.anyOf !== undefined) return unionFrom(schema.anyOf);
  if (schema.oneOf !== undefined) return unionFrom(schema.oneOf);
  if (schema.const !== undefined) {
    return schema.const === null
      ? v.null()
      : v.literal(literalFrom(schema.const));
  }
  if (schema.enum !== undefined) {
    const options = schema.enum.map(literalFrom);
    if (options.length === 0) {
      throw new Error("Canonical JSON Schema enums must not be empty.");
    }
    return v.picklist(options as v.PicklistOptions);
  }

  switch (schema.type) {
    case "array":
      return v.array(
        schema.items === undefined ? v.unknown() : schemaFrom(schema.items),
      );
    case "boolean":
      return v.boolean();
    case "integer":
      return numberSchemaFrom(schema, true);
    case "null":
      return v.null();
    case "number":
      return numberSchemaFrom(schema, false);
    case "object":
      return objectSchemaFrom(schema);
    case "string":
      return stringSchemaFrom(schema);
    default:
      throw new Error(
        `Unsupported canonical JSON Schema type: ${String(schema.type)}`,
      );
  }
};

const schemaFrom = (jsonSchema: unknown): v.GenericSchema<unknown> => {
  const schema = schemaObjectFrom(jsonSchema);
  const baseSchema = baseSchemaFrom(schema);
  return schema.description === undefined
    ? baseSchema
    : v.pipe(baseSchema, v.description(schema.description));
};

/**
 * Flue derives the provider tool definition from Valibot, while Petrinaut owns
 * its schemas in Zod. Build the provider-facing structure from Petrinaut's
 * emitted JSON Schema, then let the canonical Zod parser remain the final
 * validation authority.
 */
export const valibotObjectSchemaFromJsonSchema = (
  jsonSchema: unknown,
): v.GenericSchema<Record<string, unknown>> => {
  const schema = schemaFrom(jsonSchema);
  if (
    schema.type !== "object" &&
    schema.type !== "strict_object" &&
    schema.type !== "loose_object"
  ) {
    throw new Error(
      "Canonical Petrinaut tool inputs must be top-level objects.",
    );
  }
  return schema as v.GenericSchema<Record<string, unknown>>;
};
