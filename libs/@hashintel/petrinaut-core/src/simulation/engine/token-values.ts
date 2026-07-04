import { NIL_UUID, toUuid } from "./uuid";

import type {
  Color,
  ColorElementType,
  TokenAttributeValue,
  TokenRecord,
} from "../../types/sdcpn";

type ColorElement = Color["elements"][number];

export function defaultTokenAttributeValue(
  type: ColorElementType,
): TokenAttributeValue {
  switch (type) {
    case "boolean":
      return false;
    case "integer":
    case "real":
      return 0;
    case "string":
      return "";
    case "uuid":
      return NIL_UUID;
  }
}

function coerceNumber(value: unknown, context: string): number {
  const numberValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numberValue)) {
    throw new Error(`${context} must be a finite number.`);
  }
  return numberValue;
}

function coerceBoolean(value: unknown, context: string): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1") {
      return true;
    }
    if (normalized === "false" || normalized === "0" || normalized === "") {
      return false;
    }
  }
  throw new Error(`${context} must be a boolean.`);
}

export function coerceTokenAttributeValue(
  element: ColorElement,
  value: unknown,
  context: string,
): TokenAttributeValue {
  const rawValue = value ?? defaultTokenAttributeValue(element.type);
  switch (element.type) {
    case "real":
      return coerceNumber(rawValue, context);
    case "integer":
      return Math.round(coerceNumber(rawValue, context));
    case "boolean":
      return coerceBoolean(rawValue, context);
    case "string":
      // Total conversion: any value stringifies; undefined/null → "" (the
      // ?? default above resolves them to "" before this arm).
      // eslint-disable-next-line typescript/no-base-to-string -- intentional: non-primitives map through their default stringification, keeping the conversion total
      return typeof rawValue === "string" ? rawValue : String(rawValue);
    case "uuid":
      // Total conversion: bigints and UUID strings pass through/parse, and
      // any other value maps deterministically to a UUIDv5 — never throws.
      return toUuid(rawValue);
  }
}

export function coerceTokenRecord(
  source: Record<string, unknown>,
  elements: readonly ColorElement[],
  context: string,
): TokenRecord {
  const token: TokenRecord = {};
  for (const element of elements) {
    token[element.name] = coerceTokenAttributeValue(
      element,
      source[element.name],
      `${context}.${element.name}`,
    );
  }
  return token;
}

/**
 * Decodes one number-slot (`f64` / `u8`) buffer value back into a logical
 * token attribute value.
 *
 * `uuid` and `string` elements never reach this codec: uuid lanes are
 * assembled/split directly in `token-layout.ts` (`readTokenRecord` /
 * `writeTokenValue`), and string pool references resolve through the run's
 * `StringPool` there — the arms here only keep the switch exhaustive over
 * `ColorElementType`.
 */
export function decodeTokenAttributeValue(
  element: ColorElement,
  encodedValue: number,
): TokenAttributeValue {
  switch (element.type) {
    case "real":
      return encodedValue;
    case "integer":
      return Math.round(encodedValue);
    case "boolean":
      return encodedValue !== 0;
    case "string":
      throw new Error(
        `decodeTokenAttributeValue received string element "${element.name}"; string pool references are decoded in token-layout.ts`,
      );
    case "uuid":
      throw new Error(
        `decodeTokenAttributeValue received uuid element "${element.name}"; uuid lanes are decoded in token-layout.ts`,
      );
  }
}

/**
 * Encodes a token attribute value into its frame buffer slot representation
 * (booleans are stored as 0/1, integers are rounded, uuids stay bigints for
 * the two-lane writer in `token-layout.ts`).
 *
 * `string` elements are not encodable without a `StringPool` and throw here —
 * callers with string fields intern first (`encodeTokenToBytes` /
 * `encodeKernelOutputToken`).
 */
export function encodeTokenAttributeValue(
  element: ColorElement,
  value: unknown,
  context: string,
): number | bigint {
  if (element.type === "string") {
    throw new Error(
      `${context}: string element "${element.name}" must be interned through a StringPool before encoding`,
    );
  }
  const coerced = coerceTokenAttributeValue(element, value, context);
  return typeof coerced === "boolean"
    ? coerced
      ? 1
      : 0
    : (coerced as number | bigint);
}

/**
 * Decodes a token from one number per element (legacy numeric layout used by
 * external callers). Colours with `uuid` or `string` elements are not
 * representable in this form — use `readTokenRecord` from `token-layout.ts`
 * instead.
 */
export function decodeTokenRecord(
  elements: readonly ColorElement[],
  encodedValues: ArrayLike<number>,
): TokenRecord {
  const token: TokenRecord = {};
  for (let index = 0; index < elements.length; index++) {
    const element = elements[index]!;
    token[element.name] = decodeTokenAttributeValue(
      element,
      encodedValues[index] ?? 0,
    );
  }
  return token;
}
