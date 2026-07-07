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
  }
}

/**
 * Encodes a token attribute value into the numeric frame buffer
 * representation (booleans are stored as 0/1, integers are rounded).
 */
export function encodeTokenAttributeValue(
  element: ColorElement,
  value: unknown,
  context: string,
): number {
  const coerced = coerceTokenAttributeValue(element, value, context);
  return typeof coerced === "boolean" ? (coerced ? 1 : 0) : coerced;
}

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
