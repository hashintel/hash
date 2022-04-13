import { JSONValue, JSONObject, JSONArray } from "blockprotocol";
import { Schema } from "jsonschema";

export const isParsedJsonObject = (
  val: JSONValue | undefined,
): val is JSONObject =>
  typeof val === "object" && val !== null && !Array.isArray(val);

export const isParsedJsonObjectOrArray = (
  val: JSONValue,
): val is JSONObject | JSONArray =>
  Array.isArray(val) || isParsedJsonObject(val);

export const parseJson = <T extends JSONObject | JSONArray>(
  jsonString: string,
): T => JSON.parse(jsonString);

export type JsonSchema = Schema & {
  $defs?: Record<string, JsonSchema>;
  default?: JSONValue;
};

export const primitiveJsonTypes = [
  "boolean",
  "integer",
  "number",
  "null",
  "string",
] as const;
export type PrimitiveJsonType = typeof primitiveJsonTypes[number];
