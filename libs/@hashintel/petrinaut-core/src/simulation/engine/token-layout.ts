import {
  decodeTokenAttributeValue,
  encodeTokenAttributeValue,
} from "./token-values";

import type { Color, ColorElementType, TokenRecord } from "../../types/sdcpn";

type ColorElement = Color["elements"][number];

/**
 * Physical (buffer-level) representation of one token attribute in the
 * format-v2 packed struct layout:
 *
 * - `f64`: 8 bytes, 8-byte aligned (`real` and `integer` elements).
 * - `u8`: 1 byte, 1-byte aligned (`boolean` elements).
 */
export type PhysicalKind = "f64" | "u8";

export type TokenLayoutField = {
  element: ColorElement;
  kind: PhysicalKind;
  byteOffset: number;
  byteSize: number;
};

/**
 * Packed struct layout for one token of a colour (the C `sizeof` and
 * `offsetof`). This is the single source of truth for how token bytes are
 * arranged inside engine frames.
 *
 * Fields are ordered by decreasing alignment (stable within equal alignment),
 * each field's byte offset is aligned to its physical alignment, and the
 * stride is rounded up to 8 bytes so consecutive tokens keep f64 fields
 * 8-aligned. Because the stride is a multiple of 8 and token regions start at
 * 8-aligned offsets, all f64 fields are addressable through a shared
 * `Float64Array` view and all u8 fields through a `Uint8Array` view — no
 * `DataView` is needed in hot paths.
 */
export type TokenSlotLayout = {
  /** sizeof(token) — total bytes per token, including padding. 0 when empty. */
  strideBytes: number;
  /** Fields sorted by byteOffset. */
  fields: TokenLayoutField[];
  /** Alignment gaps and tail padding, as half-open byte ranges. */
  paddingRanges: { start: number; end: number }[];
  /**
   * f64-view index within one token (`byteOffset / 8`) of each `real`
   * element, in field order. Continuous dynamics only integrate these.
   */
  realFieldF64Offsets: number[];
};

type PhysicalType = { kind: PhysicalKind; byteSize: number; align: number };

const PHYSICAL_TYPES: Record<PhysicalKind, PhysicalType> = {
  f64: { kind: "f64", byteSize: 8, align: 8 },
  u8: { kind: "u8", byteSize: 1, align: 1 },
};

function physicalTypeFor(elementType: ColorElementType): PhysicalType {
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
 * Computes the packed struct layout for one token of a colour.
 *
 * An empty element list yields a zero-stride layout (uncoloured places store
 * no token bytes).
 */
export function computeTokenSlotLayout(
  elements: readonly ColorElement[],
): TokenSlotLayout {
  const withPhysical = elements.map((element) => ({
    element,
    physical: physicalTypeFor(element.type),
  }));
  // `Array.prototype.sort` is stable, so fields with equal alignment keep
  // their declaration order.
  const ordered = [...withPhysical].sort(
    (a, b) => b.physical.align - a.physical.align,
  );

  const fields: TokenLayoutField[] = [];
  const paddingRanges: { start: number; end: number }[] = [];
  let cursor = 0;
  for (const { element, physical } of ordered) {
    const byteOffset = alignTo(cursor, physical.align);
    if (byteOffset > cursor) {
      paddingRanges.push({ start: cursor, end: byteOffset });
    }
    fields.push({
      element,
      kind: physical.kind,
      byteOffset,
      byteSize: physical.byteSize,
    });
    cursor = byteOffset + physical.byteSize;
  }

  const strideBytes = fields.length === 0 ? 0 : alignTo(cursor, 8);
  if (strideBytes > cursor) {
    paddingRanges.push({ start: cursor, end: strideBytes });
  }

  const realFieldF64Offsets = fields
    .filter((field) => field.element.type === "real")
    .map((field) => field.byteOffset / 8);

  return { strideBytes, fields, paddingRanges, realFieldF64Offsets };
}

export type TokenRegionViews = {
  f64: Float64Array;
  u8: Uint8Array;
};

/**
 * Creates the shared f64/u8 views over one token byte region.
 *
 * The region must start at an 8-aligned byte offset and span a multiple of 8
 * bytes — both invariants hold for engine frame token regions because place
 * strides are multiples of 8 and regions are allocated at 8-aligned offsets.
 */
export function createTokenRegionViews(
  buffer: ArrayBufferLike,
  byteOffset: number,
  byteLength: number,
): TokenRegionViews {
  if (byteOffset % 8 !== 0) {
    throw new Error(
      `Token region byte offset ${byteOffset} is not 8-byte aligned`,
    );
  }
  if (byteLength % 8 !== 0) {
    throw new Error(
      `Token region byte length ${byteLength} is not a multiple of 8`,
    );
  }

  return {
    f64: new Float64Array(buffer, byteOffset, byteLength / 8),
    u8: new Uint8Array(buffer, byteOffset, byteLength),
  };
}

/**
 * Token starts must be 8-aligned: f64 fields are read as
 * `f64[byteOffset / 8]`, and a fractional index on a typed array is a plain
 * (silent, always-undefined) property access, not a buffer read. Field
 * offsets within a token are 8-aligned by construction
 * (`computeTokenSlotLayout` orders fields by alignment and rounds strides to
 * 8), so guarding the token start catches every misalignment loudly.
 */
function assertTokenAligned(tokenByteOffset: number): void {
  if (tokenByteOffset % 8 !== 0) {
    throw new Error(
      `Token byte offset ${tokenByteOffset} is not 8-byte aligned`,
    );
  }
}

/**
 * Decodes one token starting at `tokenByteOffset` (relative to the start of
 * the viewed region) into a logical record, using the shared value codec.
 */
export function readTokenRecord(
  layout: TokenSlotLayout,
  f64: Float64Array,
  u8: Uint8Array,
  tokenByteOffset: number,
): TokenRecord {
  assertTokenAligned(tokenByteOffset);
  const token: TokenRecord = {};
  for (const field of layout.fields) {
    const encodedValue =
      field.kind === "f64"
        ? (f64[(tokenByteOffset + field.byteOffset) / 8] ?? 0)
        : (u8[tokenByteOffset + field.byteOffset] ?? 0);
    token[field.element.name] = decodeTokenAttributeValue(
      field.element,
      encodedValue,
    );
  }
  return token;
}

/**
 * Writes one already-encoded slot value (see `encodeTokenAttributeValue`)
 * into a token's field. `tokenByteOffset` is relative to the start of the
 * viewed region.
 */
export function writeTokenValue(
  field: TokenLayoutField,
  f64: Float64Array,
  u8: Uint8Array,
  tokenByteOffset: number,
  encodedSlotValue: number,
): void {
  assertTokenAligned(tokenByteOffset);
  /* eslint-disable no-param-reassign -- writing through shared token region views is the point of this helper */
  if (field.kind === "f64") {
    f64[(tokenByteOffset + field.byteOffset) / 8] = encodedSlotValue;
  } else {
    u8[tokenByteOffset + field.byteOffset] = encodedSlotValue;
  }
  /* eslint-enable no-param-reassign */
}

/**
 * Encodes pre-sampled, already-encoded slot values (keyed by element name)
 * into a fresh stride-sized byte block. Used by transition kernels, which
 * sample distribution values in element declaration order before packing.
 */
export function encodeTokenValuesToBytes(
  layout: TokenSlotLayout,
  encodedValuesByName: Readonly<Record<string, number>>,
): Uint8Array {
  const { f64, u8 } = createTokenRegionViews(
    new ArrayBuffer(layout.strideBytes),
    0,
    layout.strideBytes,
  );
  for (const field of layout.fields) {
    writeTokenValue(
      field,
      f64,
      u8,
      0,
      encodedValuesByName[field.element.name] ?? 0,
    );
  }
  return u8;
}

/**
 * Coerces and encodes one token record into a fresh stride-sized byte block.
 */
export function encodeTokenToBytes(
  layout: TokenSlotLayout,
  record: Record<string, unknown>,
  context: string,
): Uint8Array {
  const { f64, u8 } = createTokenRegionViews(
    new ArrayBuffer(layout.strideBytes),
    0,
    layout.strideBytes,
  );
  for (const field of layout.fields) {
    const encodedValue = encodeTokenAttributeValue(
      field.element,
      record[field.element.name],
      `${context}.${field.element.name}`,
    );
    writeTokenValue(field, f64, u8, 0, encodedValue);
  }
  return u8;
}
