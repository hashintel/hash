/**
 * An encoded token as the memory view draws it: its bytes cut into one group
 * per field and per stretch of padding, each byte spelled out bit by bit.
 */

import type {
  TokenLayoutField,
  TokenSlotLayout,
} from "@hashintel/petrinaut-core";

/**
 * The order a field's bytes are listed in: `logical` puts the most
 * significant byte first, as a number is written; `memory` follows the
 * buffer, which is little-endian, so the least significant byte comes first.
 */
export type ByteOrder = "logical" | "memory";

/** The part of an IEEE 754 double a bit belongs to; `plain` in any other field. */
export type BitPart = "sign" | "exponent" | "mantissa" | "plain";

export interface MemoryBit {
  value: number;
  part: BitPart;
}

export interface MemoryByte {
  /** The byte's index in the token, with the lane for a UUID: `b12 lo`. */
  label: string;
  /** Most significant bit first; empty for a byte of padding. */
  bits: MemoryBit[];
}

export interface MemoryGroup {
  byteOffset: number;
  /** Null for padding. */
  field: TokenLayoutField | null;
  bytes: MemoryByte[];
}

/** `index` counts from the most significant bit of the whole field. */
const bitPart = (field: TokenLayoutField, index: number): BitPart => {
  if (field.kind !== "f64") {
    return "plain";
  }
  if (index === 0) {
    return "sign";
  }
  return index <= 11 ? "exponent" : "mantissa";
};

const fieldBytes = (
  field: TokenLayoutField,
  bytes: Uint8Array,
  byteOrder: ByteOrder,
): MemoryByte[] =>
  Array.from({ length: field.byteSize }, (_, row) => {
    // Counted from the field's first byte in memory, its least significant.
    const byteInField =
      byteOrder === "logical" ? field.byteSize - 1 - row : row;
    const byteIndex = field.byteOffset + byteInField;
    const byte = bytes[byteIndex] ?? 0;
    // A UUID is two 64-bit lanes, the low one first.
    const lane =
      field.kind === "u64x2" ? (byteInField < 8 ? " lo" : " hi") : "";
    return {
      label: `b${byteIndex}${lane}`,
      bits: Array.from({ length: 8 }, (__, column) => {
        const bitInByte = 7 - column;
        const bitInField = byteInField * 8 + bitInByte;
        return {
          value: (byte >> bitInByte) & 1,
          part: bitPart(field, field.byteSize * 8 - 1 - bitInField),
        };
      }),
    };
  });

/** The token's groups in memory order, whichever way each lists its bytes. */
export const memoryGroups = (
  layout: TokenSlotLayout,
  bytes: Uint8Array,
  byteOrder: ByteOrder,
): MemoryGroup[] =>
  [
    ...layout.fields.map((field) => ({
      byteOffset: field.byteOffset,
      field,
      bytes: fieldBytes(field, bytes, byteOrder),
    })),
    ...layout.paddingRanges.map((range) => ({
      byteOffset: range.start,
      field: null,
      bytes: Array.from({ length: range.end - range.start }, (_, index) => ({
        label: `b${range.start + index}`,
        bits: [],
      })),
    })),
  ].sort((left, right) => left.byteOffset - right.byteOffset);

/** The field's bytes as one number, most significant digit first. */
export const fieldHex = (bytes: Uint8Array, field: TokenLayoutField): string =>
  `0x${Array.from(
    bytes.subarray(field.byteOffset, field.byteOffset + field.byteSize),
    (byte) => byte.toString(16).padStart(2, "0"),
  )
    .reverse()
    .join("")}`;

/** The id a `string` field holds in place of its text. */
export const stringPoolId = (
  bytes: Uint8Array,
  field: TokenLayoutField,
): number =>
  Number(
    new DataView(bytes.buffer, bytes.byteOffset).getBigUint64(
      field.byteOffset,
      true,
    ),
  );
