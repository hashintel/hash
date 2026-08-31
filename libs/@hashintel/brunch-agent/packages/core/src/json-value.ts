import * as v from "valibot";

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export const isJsonValue = (value: unknown): value is JsonValue => {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return true;
  // JSON.stringify would silently rewrite non-finite numbers and negative zero,
  // so the persisted value could not be reproduced on read.
  if (typeof value === "number")
    return Number.isFinite(value) && !Object.is(value, -0);
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (typeof value !== "object") return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return (
    (prototype === Object.prototype || prototype === null) &&
    Object.values(value as Record<string, unknown>).every(isJsonValue)
  );
};

export const JsonValueSchema = v.custom<JsonValue>(
  isJsonValue,
  "Expected a JSON-compatible value.",
);
