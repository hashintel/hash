import type { Schema , validate } from "jsonschema";
import type { JsonArray, JsonObject, JsonValue } from "@blockprotocol/core";

export const validateDataAgainstSchema = (data: unknown, schema: Schema) =>
  validate(data, schema);

export const isParsedJsonObject = (
  value: JsonValue | undefined,
): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const isParsedJsonObjectOrArray = (
  value: JsonValue,
): value is JsonObject | JsonArray =>
  Array.isArray(value) || isParsedJsonObject(value);

export const parseJson = <T extends JsonObject | JsonArray>(
  jsonString: string,
): T => JSON.parse(jsonString);

export type JsonSchema = Schema & {
  configProperties?: string[];
  $defs?: Record<string, JsonSchema>;
  default?: JsonValue;
};

export const primitiveJsonTypes = [
  "boolean",
  "integer",
  "number",
  "null",
  "string",
] as const;
export type PrimitiveJsonType = (typeof primitiveJsonTypes)[number];
