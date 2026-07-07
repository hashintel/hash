import {
  coerceTokenAttributeValue,
  decodeTokenAttributeValue,
  encodeTokenAttributeValue,
} from "@hashintel/petrinaut-core";

import type { ColorElementType, TokenRecord } from "@hashintel/petrinaut-core";

/**
 * Physical (buffer-level) representation of one token attribute.
 *
 * This mirrors the planned "format v2" abstraction for engine frames: the
 * logical schema type (`ColorElementType`) maps to a physical type with a
 * byte size and alignment, and a per-colour struct layout is computed from
 * that mapping. `u64x2` exists for future 128-bit types (FE-1121) — the
 * memory view renders it, but no logical type maps to it yet.
 */
export type PhysicalKind = "f64" | "u8" | "u64x2";

export type PhysicalType = {
  kind: PhysicalKind;
  byteSize: number;
  align: number;
};

/**
 * - `v1`: the shipped engine encoding — every dimension is one Float64 slot,
 *   in declaration order.
 * - `v2`: the planned packed-struct encoding — booleans become `u8`, fields
 *   are ordered by decreasing alignment, stride is rounded up to 8 bytes.
 */
export type LayoutMode = "v1" | "v2";

export type PlaygroundDimension = {
  name: string;
  type: ColorElementType;
};

export type LayoutField = {
  name: string;
  elementType: ColorElementType;
  physical: PhysicalType;
  byteOffset: number;
};

/** Half-open byte range `[start, end)` within one token's stride. */
export type ByteRange = { start: number; end: number };

export type TokenLayout = {
  mode: LayoutMode;
  /** sizeof(token) — total bytes per token, including padding. */
  strideBytes: number;
  fields: LayoutField[];
  /** Alignment gaps and tail padding. */
  paddingRanges: ByteRange[];
};

const PHYSICAL_TYPES: Record<PhysicalKind, PhysicalType> = {
  f64: { kind: "f64", byteSize: 8, align: 8 },
  u8: { kind: "u8", byteSize: 1, align: 1 },
  u64x2: { kind: "u64x2", byteSize: 16, align: 8 },
};

export function physicalTypeFor(
  elementType: ColorElementType,
  mode: LayoutMode,
): PhysicalType {
  if (mode === "v1") {
    return PHYSICAL_TYPES.f64;
  }
  switch (elementType) {
    case "boolean":
      return PHYSICAL_TYPES.u8;
    case "integer":
    case "real":
      return PHYSICAL_TYPES.f64;
  }
}

const alignTo = (value: number, alignment: number): number =>
  Math.ceil(value / alignment) * alignment;

/**
 * Computes the packed struct layout for one token (the C `sizeof` and
 * `offsetof`). In `v2` mode, fields are ordered by decreasing alignment
 * (stable within equal alignment) so no interior padding is wasted, and the
 * stride is rounded up to 8 bytes so consecutive tokens keep f64 fields
 * 8-aligned.
 */
export function computeTokenLayout(
  dimensions: readonly PlaygroundDimension[],
  mode: LayoutMode,
): TokenLayout {
  const withPhysical = dimensions.map((dimension) => ({
    dimension,
    physical: physicalTypeFor(dimension.type, mode),
  }));
  const ordered =
    mode === "v2"
      ? [...withPhysical].sort((a, b) => b.physical.align - a.physical.align)
      : withPhysical;

  const fields: LayoutField[] = [];
  const paddingRanges: ByteRange[] = [];
  let cursor = 0;
  for (const { dimension, physical } of ordered) {
    const byteOffset = alignTo(cursor, physical.align);
    if (byteOffset > cursor) {
      paddingRanges.push({ start: cursor, end: byteOffset });
    }
    fields.push({
      name: dimension.name,
      elementType: dimension.type,
      physical,
      byteOffset,
    });
    cursor = byteOffset + physical.byteSize;
  }

  const strideBytes = fields.length === 0 ? 0 : alignTo(cursor, 8);
  if (strideBytes > cursor) {
    paddingRanges.push({ start: cursor, end: strideBytes });
  }

  return { mode, strideBytes, fields, paddingRanges };
}

export type EncodedToken = {
  buffer: ArrayBuffer;
  /** The coerced value actually stored (integers rounded, booleans as 0/1). */
  stored: TokenRecord;
  /** The value read back out of the buffer — the full round-trip. */
  decoded: TokenRecord;
};

const toColorElement = (field: LayoutField) => ({
  elementId: field.name,
  name: field.name,
  type: field.elementType,
});

export function decodeToken(
  layout: TokenLayout,
  buffer: ArrayBuffer,
): TokenRecord {
  const view = new DataView(buffer);
  const token: TokenRecord = {};
  for (const field of layout.fields) {
    const element = toColorElement(field);
    switch (field.physical.kind) {
      case "f64":
        token[field.name] = decodeTokenAttributeValue(
          element,
          view.getFloat64(field.byteOffset, true),
        );
        break;
      case "u8":
        token[field.name] = decodeTokenAttributeValue(
          element,
          view.getUint8(field.byteOffset),
        );
        break;
      case "u64x2":
        throw new Error(
          `Token.${field.name}: 128-bit decoding is not implemented yet (FE-1121)`,
        );
    }
  }
  return token;
}

/**
 * Encodes one token record into a fresh buffer using the real product codec
 * (`encodeTokenAttributeValue`) for value coercion, then decodes it back so
 * callers can show the round-trip. All multi-byte values are little-endian,
 * matching the platform layout of the engine's typed-array views.
 */
export function encodeToken(
  layout: TokenLayout,
  record: Record<string, unknown>,
): EncodedToken {
  const buffer = new ArrayBuffer(layout.strideBytes);
  const view = new DataView(buffer);
  const stored: TokenRecord = {};

  for (const field of layout.fields) {
    const element = toColorElement(field);
    const context = `Token.${field.name}`;
    const slotValue = encodeTokenAttributeValue(
      element,
      record[field.name],
      context,
    );
    switch (field.physical.kind) {
      case "f64":
        view.setFloat64(field.byteOffset, slotValue, true);
        break;
      case "u8":
        view.setUint8(field.byteOffset, slotValue);
        break;
      case "u64x2":
        throw new Error(
          `Token.${field.name}: 128-bit encoding is not implemented yet (FE-1121)`,
        );
    }
    stored[field.name] = coerceTokenAttributeValue(
      element,
      record[field.name],
      context,
    );
  }

  return { buffer, stored, decoded: decodeToken(layout, buffer) };
}

/**
 * Returns one field's bits most-significant first (the "logical" reading
 * order: for f64 that is sign, exponent, mantissa). Multi-byte values are
 * stored little-endian, so the byte walk is reversed.
 */
export function getFieldBits(
  buffer: ArrayBuffer,
  field: LayoutField,
): number[] {
  const bytes = new Uint8Array(
    buffer,
    field.byteOffset,
    field.physical.byteSize,
  );
  const bits: number[] = [];
  for (let byteIndex = bytes.length - 1; byteIndex >= 0; byteIndex--) {
    for (let bit = 7; bit >= 0; bit--) {
      // eslint-disable-next-line no-bitwise -- bit extraction is the point here
      bits.push((bytes[byteIndex]! >> bit) & 1);
    }
  }
  return bits;
}

/** Hex form of the field's stored bytes, most-significant byte first. */
export function getFieldHex(buffer: ArrayBuffer, field: LayoutField): string {
  const bytes = new Uint8Array(
    buffer,
    field.byteOffset,
    field.physical.byteSize,
  );
  let hex = "";
  for (let byteIndex = bytes.length - 1; byteIndex >= 0; byteIndex--) {
    hex += bytes[byteIndex]!.toString(16).padStart(2, "0");
  }
  return `0x${hex}`;
}

/**
 * IEEE-754 double anatomy for a bit index in MSB-first order:
 * bit 0 = sign, bits 1–11 = exponent, bits 12–63 = mantissa.
 */
export type F64BitPart = "sign" | "exponent" | "mantissa";

export function f64BitPart(msbFirstIndex: number): F64BitPart {
  if (msbFirstIndex === 0) {
    return "sign";
  }
  return msbFirstIndex <= 11 ? "exponent" : "mantissa";
}
