import * as v from "valibot";

/**
 * Immutable JSON. Distinct from Flue's mutable `JsonValue`: this guard also
 * refuses non-finite numbers and negative zero, which `JSON.stringify` would
 * silently rewrite.
 */
export type ReadonlyJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly ReadonlyJsonValue[]
  | { readonly [key: string]: ReadonlyJsonValue };

export const isJsonValue = (value: unknown): value is ReadonlyJsonValue => {
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

export const JsonValueSchema = v.custom<ReadonlyJsonValue>(
  isJsonValue,
  "Expected a JSON-compatible value.",
);
