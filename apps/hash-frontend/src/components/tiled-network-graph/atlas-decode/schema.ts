/**
 * Shared schema-validation helpers for the per-kind SALTILE decoders:
 * typed guards over decoded CBOR values (the type-aware lint requires
 * guards - `instanceof Map` and `Array.isArray` both narrow to `any`
 * containers), request-echo assertions, and slot-extent checks.
 */

import { SaltileWireError, type SaltileSlot } from "./wire";

import type { CborValue } from "./cbor";
import type { EntityId } from "@blockprotocol/type-system";

/** Length of a generation identity in bytes (sha256). */
export const GENERATION_BYTES = 32;

/** Length of an entity identity in bytes: web uuid then entity uuid. */
export const ENTITY_ID_BYTES = 32;

export const fail = (detail: string, offset: number): never => {
  throw new SaltileWireError(detail, offset);
};

export const isUint = (value: CborValue | undefined): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;

export const isCborArray = (
  value: CborValue | undefined,
): value is readonly CborValue[] => Array.isArray(value);

export const isCborMap = (
  value: CborValue | undefined,
): value is ReadonlyMap<number, CborValue> => value instanceof Map;

export const isUintArray = (
  value: CborValue | undefined,
): value is readonly number[] =>
  isCborArray(value) && value.every((entry) => isUint(entry));

export const isNumberArray = (
  value: CborValue | undefined,
): value is readonly number[] =>
  isCborArray(value) && value.every((entry) => typeof entry === "number");

export const isNullableStringArray = (
  value: CborValue | undefined,
): value is readonly (string | null)[] =>
  isCborArray(value) &&
  value.every((entry) => entry === null || typeof entry === "string");

export const requireUint = (
  map: ReadonlyMap<number, CborValue>,
  key: number,
  name: string,
  offset: number,
): number => {
  const value = map.get(key);
  if (!isUint(value)) {
    return fail(
      `HEAD ${name} (key ${key}) must be an unsigned integer`,
      offset,
    );
  }
  return value;
};

export const requireBool = (
  map: ReadonlyMap<number, CborValue>,
  key: number,
  name: string,
  offset: number,
): boolean => {
  const value = map.get(key);
  if (typeof value !== "boolean") {
    return fail(`HEAD ${name} (key ${key}) must be a boolean`, offset);
  }
  return value;
};

export const expectEqual = (
  actual: number,
  expected: number,
  name: string,
  offset: number,
): void => {
  if (actual !== expected) {
    fail(`HEAD ${name} is ${actual}; the request expects ${expected}`, offset);
  }
};

export const bytesEqual = (left: Uint8Array, right: Uint8Array): boolean =>
  left.length === right.length &&
  left.every((byte, index) => byte === right[index]);

/** Validates the 32-byte generation echo against the request's. */
export const requireGenerationEcho = (
  map: ReadonlyMap<number, CborValue>,
  expected: Uint8Array,
  offset: number,
): void => {
  const generation = map.get(0);
  if (
    !(generation instanceof Uint8Array) ||
    generation.length !== GENERATION_BYTES
  ) {
    fail("HEAD generation must be a 32-byte identity", offset);
  }
  if (!bytesEqual(generation as Uint8Array, expected)) {
    fail("HEAD generation does not match the request", offset);
  }
};

/** Strict bytewise less-than over two byte strings. */
export const bytewiseLess = (left: Uint8Array, right: Uint8Array): boolean => {
  const shared = Math.min(left.length, right.length);
  for (let index = 0; index < shared; index += 1) {
    if (left[index] !== right[index]) {
      return left[index]! < right[index]!;
    }
  }
  return left.length < right.length;
};

const hexOf = (bytes: Uint8Array): string =>
  [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");

const uuidOf = (bytes: Uint8Array): string => {
  const hex = hexOf(bytes);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

/**
 * The [`EntityId`] of a 32-byte identity record.
 *
 * The record carries the web uuid then the entity uuid, sixteen bytes
 * each; the result is the canonical `webUuid~entityUuid` form.
 */
export const formatEntityId = (record: Uint8Array): EntityId =>
  // The two uuids are hex-formatted straight from the record, so the
  // result is canonical by construction.
  `${uuidOf(record.subarray(0, 16))}~${uuidOf(record.subarray(16, 32))}` as EntityId;

/**
 * The per-edge 32-byte identity records of an `EDGE_IDS` column.
 *
 * Delivery order is ascending identity bytes; a column out of order is
 * rejected.
 */
export const readEntityIdColumn = (
  column: Uint8Array,
  count: number,
  name: string,
  offset: number,
): readonly Uint8Array[] => {
  const records: Uint8Array[] = new Array<Uint8Array>(count);
  for (let index = 0; index < count; index += 1) {
    const record = column.subarray(
      index * ENTITY_ID_BYTES,
      (index + 1) * ENTITY_ID_BYTES,
    );
    if (index > 0 && !bytewiseLess(records[index - 1]!, record)) {
      return fail(
        `${name} record ${index} is not in ascending identity order`,
        offset + index * ENTITY_ID_BYTES,
      );
    }
    records[index] = record;
  }
  return records;
};

/**
 * The per-edge booleans of an LSB-first completeness bitmask.
 *
 * The byte string carries one bit per edge and is exactly
 * `ceil(count / 8)` bytes.
 */
export const readBitmask = (
  value: CborValue | undefined,
  count: number,
  name: string,
  offset: number,
): readonly boolean[] => {
  if (!(value instanceof Uint8Array)) {
    return fail(`TRAILER ${name} must be a byte string`, offset);
  }
  if (value.length !== Math.ceil(count / 8)) {
    return fail(
      `TRAILER ${name} is ${value.length} bytes; ${Math.ceil(count / 8)} required for ${count} edges`,
      offset,
    );
  }
  const bits: boolean[] = new Array<boolean>(count);
  for (let index = 0; index < count; index += 1) {
    // eslint-disable-next-line no-bitwise -- reads bit `index` from the packed bitmap
    bits[index] = (value[index >> 3]! & (1 << (index & 7))) !== 0;
  }
  return bits;
};

/**
 * The entries of an intern table (`typeTable` / `propertyTable`).
 *
 * The table is a text array, bytewise-sorted and deduplicated over the
 * UTF-8 encodings.
 */
export const readInternTable = (
  value: CborValue | undefined,
  name: string,
  offset: number,
): readonly string[] => {
  if (
    !isCborArray(value) ||
    !value.every((entry) => typeof entry === "string")
  ) {
    return fail(`TRAILER ${name} must be a text array`, offset);
  }
  // The law is bytewise UTF-8 order; a plain `<` on JS strings compares
  // UTF-16 code units, which diverges above U+FFFF.
  const encoder = new TextEncoder();
  const encoded = value.map((entry) => encoder.encode(entry));
  for (let index = 1; index < encoded.length; index += 1) {
    if (!bytewiseLess(encoded[index - 1]!, encoded[index]!)) {
      return fail(
        `TRAILER ${name} must be bytewise-sorted and deduplicated`,
        offset,
      );
    }
  }
  return value;
};

export const requireSlot = (
  slots: readonly (SaltileSlot | null)[],
  slot: number,
  name: string,
  expectedLength: number,
  responseLength: number,
): SaltileSlot => {
  const extent = slots[slot] ?? null;
  if (extent === null) {
    return fail(`required slot ${slot} (${name}) is absent`, responseLength);
  }
  const length = extent.end - extent.start;
  if (length !== expectedLength) {
    return fail(
      `slot ${slot} (${name}) is ${length} bytes; ${expectedLength} required`,
      extent.start,
    );
  }
  return extent;
};
