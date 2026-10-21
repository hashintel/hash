import { validate } from "jsonschema";

import type { JsonArray, JsonObject, JsonValue } from "@blockprotocol/core";
import type { Schema, ValidatorResult } from "jsonschema";

export const validateDataAgainstSchema = (
  // oxlint-disable-next-line typescript/no-restricted-types -- validators accept arbitrary input by design
  data: unknown,
  schema: Schema,
): ValidatorResult => validate(data, schema);

export const isParsedJsonObject = (
  val: JsonValue | undefined,
): val is JsonObject =>
  typeof val === "object" && val !== null && !Array.isArray(val);

export const isParsedJsonObjectOrArray = (
  val: JsonValue,
): val is JsonObject | JsonArray =>
  Array.isArray(val) || isParsedJsonObject(val);

// oxlint-disable-next-line typescript/no-unnecessary-type-parameters -- the caller declares the expected shape of the parsed JSON, which cannot be inferred from a string
export const parseJson = <T extends JsonObject | JsonArray>(
  jsonString: string,
): T => {
  // SAFETY: the caller asserts, via `T`, the shape of the JSON string being parsed.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- JSON.parse returns any; T is the caller-declared shape
  const parsed = JSON.parse(jsonString) as T;
  return parsed;
};

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
