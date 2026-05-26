import type {
  Color,
  ColorElementType,
  TokenAttributeValue,
  TokenRecord,
} from "../../types/sdcpn";

export const NIL_UUID = "00000000-0000-0000-0000-000000000000";

export type EncodedDiscreteValues = readonly string[];

type ColorElement = Color["elements"][number];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

export function defaultTokenAttributeValue(
  type: ColorElementType,
): TokenAttributeValue {
  switch (type) {
    case "boolean":
      return false;
    case "uuid":
      return NIL_UUID;
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

function coerceUuid(value: unknown, context: string): string {
  if (value === undefined || value === null || value === "") {
    return NIL_UUID;
  }
  if (typeof value !== "string" || !UUID_RE.test(value)) {
    throw new Error(`${context} must be a UUID string.`);
  }
  return value.toLowerCase();
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
    case "uuid":
      return coerceUuid(rawValue, context);
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
  encodedValues?: EncodedDiscreteValues,
): TokenAttributeValue {
  switch (element.type) {
    case "real":
      return encodedValue;
    case "integer":
      return Math.round(encodedValue);
    case "boolean":
      return encodedValue !== 0;
    case "uuid":
      return encodedValue === 0
        ? NIL_UUID
        : (encodedValues?.[encodedValue - 1] ?? NIL_UUID);
  }
}

export class TokenValueCodec {
  readonly #uuidToCode = new Map<string, number>();
  readonly #uuids: string[] = [];

  constructor(encodedValues?: EncodedDiscreteValues) {
    for (const value of encodedValues ?? []) {
      if (value === NIL_UUID) {
        continue;
      }
      this.#uuidToCode.set(value, this.#uuids.length + 1);
      this.#uuids.push(value);
    }
  }

  encode(element: ColorElement, value: unknown, context: string): number {
    const coerced = coerceTokenAttributeValue(element, value, context);

    switch (element.type) {
      case "real":
      case "integer":
        return coerced as number;
      case "boolean":
        return coerced ? 1 : 0;
      case "uuid": {
        const uuid = coerced as string;
        if (uuid === NIL_UUID) {
          return 0;
        }
        const existing = this.#uuidToCode.get(uuid);
        if (existing !== undefined) {
          return existing;
        }
        const nextCode = this.#uuids.length + 1;
        this.#uuidToCode.set(uuid, nextCode);
        this.#uuids.push(uuid);
        return nextCode;
      }
    }
  }

  decode(element: ColorElement, encodedValue: number): TokenAttributeValue {
    return decodeTokenAttributeValue(element, encodedValue, this.snapshot());
  }

  snapshot(): EncodedDiscreteValues | undefined {
    return this.#uuids.length > 0 ? [...this.#uuids] : undefined;
  }
}

export function decodeTokenRecord(
  elements: readonly ColorElement[],
  encodedValues: ArrayLike<number>,
  discreteValues?: EncodedDiscreteValues,
): TokenRecord {
  const token: TokenRecord = {};
  for (let index = 0; index < elements.length; index++) {
    const element = elements[index]!;
    token[element.name] = decodeTokenAttributeValue(
      element,
      encodedValues[index] ?? 0,
      discreteValues,
    );
  }
  return token;
}
