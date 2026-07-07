import {
  coerceTokenAttributeValue,
  decodeTokenAttributeValue,
  encodeTokenAttributeValue,
} from "./token-values";
import { TYPE_POLICIES } from "./type-policies";
import { NIL_UUID, toUuid } from "./uuid";

import type { Color, ColorElementType, TokenRecord } from "../../types/sdcpn";
import type { PhysicalKind } from "./type-policies";

export type { PhysicalKind } from "./type-policies";

type ColorElement = Color["elements"][number];

/**
 * Read side of the per-run string pool, needed to decode `string` (u64 pool
 * reference) fields. `StringPool` satisfies this shape.
 */
export type StringPoolReader = { get(id: number): string };

/** Write side of the per-run string pool (interning on encode). */
export type StringPoolWriter = { intern(value: string): number };

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
 * `Float64Array` view, all uuid lanes through a shared `BigUint64Array`
 * view, and all u8 fields through a `Uint8Array` view — no `DataView` is
 * needed in hot paths.
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
  u64: { kind: "u64", byteSize: 8, align: 8 },
  // 16 bytes but only 8-byte alignment — deliberate: JS has no 128-bit load,
  // uuid lanes are always read/written as two 64-bit BigUint64Array elements,
  // so 8-byte alignment is all the views require.
  u64x2: { kind: "u64x2", byteSize: 16, align: 8 },
};

function physicalTypeFor(elementType: ColorElementType): PhysicalType {
  return PHYSICAL_TYPES[TYPE_POLICIES[elementType].physicalKind];
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
  /** 64-bit lane view for `u64x2` (uuid) and `u64` (string ID) fields. */
  u64: BigUint64Array;
};

/**
 * Creates the shared f64/u64/u8 views over one token byte region.
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
    u64: new BigUint64Array(buffer, byteOffset, byteLength / 8),
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
 * the viewed region) into a logical record. Number-slot kinds (`f64`, `u8`)
 * go through the shared value codec; `u64x2` (uuid) lanes are assembled here
 * directly, and `u64` (string) fields resolve their pool reference through
 * `stringPool` — `decodeTokenAttributeValue` never sees uuid/string elements.
 *
 * Layouts containing string fields REQUIRE a `stringPool`; omitting it is a
 * programmer error and throws.
 */
export function readTokenRecord(
  layout: TokenSlotLayout,
  views: TokenRegionViews,
  tokenByteOffset: number,
  stringPool?: StringPoolReader,
): TokenRecord {
  assertTokenAligned(tokenByteOffset);
  const { f64, u8, u64 } = views;
  const token: TokenRecord = {};
  for (const field of layout.fields) {
    if (field.kind === "u64") {
      if (!stringPool) {
        throw new Error(
          `readTokenRecord: layout contains string field "${field.element.name}" but no string pool was provided`,
        );
      }
      const laneIndex = (tokenByteOffset + field.byteOffset) / 8;
      token[field.element.name] = stringPool.get(Number(u64[laneIndex] ?? 0n));
      continue;
    }
    if (field.kind === "u64x2") {
      const laneIndex = (tokenByteOffset + field.byteOffset) / 8;
      const lo = u64[laneIndex] ?? 0n;
      const hi = u64[laneIndex + 1] ?? 0n;
      // eslint-disable-next-line no-bitwise -- lane assembly
      token[field.element.name] = (hi << 64n) | lo;
      continue;
    }
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
 *
 * `u64x2` (uuid) fields take the value as a pre-coerced bigint (anything
 * else is coerced via `toUuid`) and write both little-endian 64-bit lanes.
 * `u64` (string) fields take an already-interned pool ID (bigint or number)
 * — callers intern through the run's `StringPool` first.
 */
export function writeTokenValue(
  field: TokenLayoutField,
  views: TokenRegionViews,
  tokenByteOffset: number,
  encodedSlotValue: number | bigint,
): void {
  assertTokenAligned(tokenByteOffset);
  const { f64, u8, u64 } = views;
  /* eslint-disable no-bitwise -- lane splitting is the point of this helper */
  if (field.kind === "u64") {
    u64[(tokenByteOffset + field.byteOffset) / 8] = BigInt(encodedSlotValue);
  } else if (field.kind === "u64x2") {
    // toUuid unconditionally: it passes in-range bigints through, and an
    // out-of-range bigint would otherwise wrap silently in the lane writes.
    const uuidValue = toUuid(encodedSlotValue);
    const laneIndex = (tokenByteOffset + field.byteOffset) / 8;
    u64[laneIndex] = uuidValue & 0xffffffffffffffffn;
    u64[laneIndex + 1] = uuidValue >> 64n;
  } else if (field.kind === "f64") {
    f64[(tokenByteOffset + field.byteOffset) / 8] = Number(encodedSlotValue);
  } else {
    u8[tokenByteOffset + field.byteOffset] = Number(encodedSlotValue);
  }
  /* eslint-enable no-bitwise */
}

/**
 * Encodes pre-sampled, already-encoded slot values (keyed by element name)
 * into a fresh stride-sized byte block. Used by transition kernels, which
 * resolve distribution/uuid/string values in element declaration order before
 * packing. uuid values must already be bigints; string values must already be
 * interned pool IDs (a missing string field defaults to id 0 = `""`).
 */
export function encodeTokenValuesToBytes(
  layout: TokenSlotLayout,
  encodedValuesByName: Readonly<Record<string, number | bigint>>,
): Uint8Array {
  const views = createTokenRegionViews(
    new ArrayBuffer(layout.strideBytes),
    0,
    layout.strideBytes,
  );
  for (const field of layout.fields) {
    writeTokenValue(
      field,
      views,
      0,
      encodedValuesByName[field.element.name] ??
        (field.kind === "u64x2" ? NIL_UUID : 0),
    );
  }
  return views.u8;
}

/**
 * Coerces and encodes one token record into a fresh stride-sized byte block.
 *
 * Layouts containing string fields REQUIRE a `stringPool` to intern the
 * coerced string values; omitting it is a programmer error and throws.
 */
export function encodeTokenToBytes(
  layout: TokenSlotLayout,
  record: Record<string, unknown>,
  context: string,
  stringPool?: StringPoolWriter,
): Uint8Array {
  const views = createTokenRegionViews(
    new ArrayBuffer(layout.strideBytes),
    0,
    layout.strideBytes,
  );
  for (const field of layout.fields) {
    if (field.element.type === "string") {
      if (!stringPool) {
        throw new Error(
          `encodeTokenToBytes: layout contains string field "${field.element.name}" but no string pool was provided`,
        );
      }
      const coerced = coerceTokenAttributeValue(
        field.element,
        record[field.element.name],
        `${context}.${field.element.name}`,
      );
      writeTokenValue(
        field,
        views,
        0,
        BigInt(stringPool.intern(String(coerced))),
      );
      continue;
    }
    const encodedValue = encodeTokenAttributeValue(
      field.element,
      record[field.element.name],
      `${context}.${field.element.name}`,
    );
    writeTokenValue(field, views, 0, encodedValue);
  }
  return views.u8;
}
