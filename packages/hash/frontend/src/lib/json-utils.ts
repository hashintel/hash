import { JSONValue, JSONObject, JSONArray } from "@hashintel/block-protocol";

export const isParsedJsonObject = (val: JSONValue): val is JSONObject =>
  typeof val === "object" && val !== null;

export const isParsedJsonObjectOrArray = (
  val: JSONValue,
): val is JSONObject | JSONArray =>
  Array.isArray(val) || isParsedJsonObject(val);
