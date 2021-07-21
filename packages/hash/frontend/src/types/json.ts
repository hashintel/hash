export type JSONValue =
  | null
  | boolean
  | number
  | string
  | JSONValue[]
  | { [key: string]: JSONValue };

export interface JSONObject {
  [key: string]: JSONValue;
}
export interface JSONArray extends Array<JSONValue> {}

export const isParsedJsonObject = (val: JSONValue): val is JSONObject =>
  typeof val === "object" && val !== null;

export const isParsedJsonObjectOrArray = (
  val: JSONValue
): val is JSONObject | JSONArray =>
  Array.isArray(val) || isParsedJsonObject(val);
