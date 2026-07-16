import { TYPE_POLICIES } from "./type-policies";
import { formatUuid } from "./uuid";

import type {
  Color,
  ColorElementType,
  TokenAttributeValue,
  TokenRecord,
} from "../../types/sdcpn";
import type { StoredTokenAttributeValue } from "./type-policies";

type ColorElement = Color["elements"][number];

/**
 * JSON-serializes token values for diagnostic messages. `uuid` attributes
 * are bigints, which plain `JSON.stringify` rejects with a TypeError — an
 * error path that throws while formatting would mask the original kernel or
 * lambda error, so bigints render as canonical UUID strings instead.
 */
export function describeTokenValuesForError(values: unknown): string {
  return JSON.stringify(
    values,
    (_key, value: unknown) =>
      typeof value === "bigint" ? formatUuid(value) : value,
    2,
  );
}

export function defaultTokenAttributeValue(
  type: ColorElementType,
): TokenAttributeValue {
  return TYPE_POLICIES[type].defaultValue;
}

export function coerceTokenAttributeValue(
  element: ColorElement,
  value: unknown,
  context: string,
): TokenAttributeValue {
  const policy = TYPE_POLICIES[element.type];
  // Nullish values resolve to the type's default before coercion (e.g.
  // undefined/null → "" for string elements).
  return policy.coerce(value ?? policy.defaultValue, context);
}

/**
 * Total coercion of an arbitrary value to `element`'s JSON-serializable
 * at-rest form (the shape stored in documents and scenario rows — `uuid`
 * values become canonical lowercase strings). Falls back to the element
 * type's default value when coercion throws (e.g. `"abc"` → `integer`
 * yields `0`).
 */
export function coerceToStoredTokenAttributeValue(
  element: ColorElement,
  value: unknown,
  context: string,
): StoredTokenAttributeValue {
  const policy = TYPE_POLICIES[element.type];
  let coerced: TokenAttributeValue;
  try {
    coerced = coerceTokenAttributeValue(element, value, context);
  } catch {
    coerced = policy.defaultValue;
  }
  return policy.encodeAtRest(coerced);
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
 * `StringPool` there — their policies carry no number-slot decoder, so they
 * throw here.
 */
export function decodeTokenAttributeValue(
  element: ColorElement,
  encodedValue: number,
): TokenAttributeValue {
  const decodeNumberSlot = TYPE_POLICIES[element.type].decodeNumberSlot;
  if (!decodeNumberSlot) {
    throw new Error(
      `decodeTokenAttributeValue received ${element.type} element "${element.name}"; ${element.type} fields are decoded in token-layout.ts`,
    );
  }
  return decodeNumberSlot(encodedValue);
}

/**
 * Encodes a token attribute value into its frame buffer slot representation
 * (booleans are stored as 0/1, integers are rounded, uuids stay bigints for
 * the two-lane writer in `token-layout.ts`).
 *
 * `string` elements are not encodable without a `StringPool` and throw here —
 * callers with string fields intern first (`encodeTokenToBytes`).
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
