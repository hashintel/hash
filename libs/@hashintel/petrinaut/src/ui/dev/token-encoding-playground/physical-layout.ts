import {
  coerceTokenAttributeValue,
  computeTokenSlotLayout,
  createTokenRegionViews,
  encodeTokenToBytes,
  readTokenRecord,
  StringPool,
} from "@hashintel/petrinaut-core";

import type {
  ColorElementType,
  StringPoolReader,
  TokenRecord,
  TokenSlotLayout,
} from "@hashintel/petrinaut-core";

/**
 * Thin playground wrapper over the engine's token layout module
 * (`computeTokenSlotLayout` and friends from `@hashintel/petrinaut-core`).
 * The layout math lives in the core package — this file only adapts
 * playground dimension fixtures to colour elements and adds bit-level
 * rendering helpers for the memory view.
 */
export type PlaygroundDimension = {
  name: string;
  type: ColorElementType;
};

const toColorElements = (dimensions: readonly PlaygroundDimension[]) =>
  dimensions.map((dimension) => ({
    elementId: dimension.name,
    name: dimension.name,
    type: dimension.type,
  }));

/** Computes the packed struct layout for the playground's dimensions. */
export function computePlaygroundTokenLayout(
  dimensions: readonly PlaygroundDimension[],
): TokenSlotLayout {
  return computeTokenSlotLayout(toColorElements(dimensions));
}

export type EncodedToken = {
  buffer: ArrayBuffer;
  /** The coerced value actually stored (integers rounded, booleans as 0/1). */
  stored: TokenRecord;
  /** The value read back out of the buffer — the full round-trip. */
  decoded: TokenRecord;
};

function decodeToken(
  layout: TokenSlotLayout,
  buffer: ArrayBuffer,
  stringPool?: StringPoolReader,
): TokenRecord {
  if (layout.strideBytes === 0) {
    return {};
  }
  const views = createTokenRegionViews(buffer, 0, layout.strideBytes);
  return readTokenRecord(layout, views, 0, stringPool);
}

/**
 * Encodes one token record into a fresh buffer using the real product codec
 * (`encodeTokenToBytes`) for value coercion, then decodes it back so callers
 * can show the round-trip. All multi-byte values are little-endian, matching
 * the platform layout of the engine's typed-array views. String fields
 * intern into a throwaway per-encode `StringPool` — in the product, the pool
 * lives on the simulation and persists for the whole run.
 */
export function encodeToken(
  layout: TokenSlotLayout,
  record: Record<string, unknown>,
): EncodedToken {
  const stringPool = new StringPool();
  const bytes = encodeTokenToBytes(layout, record, "Token", stringPool);
  const buffer = bytes.buffer as ArrayBuffer;

  const stored: TokenRecord = {};
  for (const field of layout.fields) {
    stored[field.element.name] = coerceTokenAttributeValue(
      field.element,
      record[field.element.name],
      `Token.${field.element.name}`,
    );
  }

  return { buffer, stored, decoded: decodeToken(layout, buffer, stringPool) };
}

/**
 * IEEE-754 double anatomy for a bit index in MSB-first order:
 * bit 0 = sign, bits 1–11 = exponent, bits 12–63 = mantissa.
 */
type F64BitPart = "sign" | "exponent" | "mantissa";

export function f64BitPart(msbFirstIndex: number): F64BitPart {
  if (msbFirstIndex === 0) {
    return "sign";
  }
  return msbFirstIndex <= 11 ? "exponent" : "mantissa";
}
