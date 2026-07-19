/**
 * Shared schema-validation helpers for the per-kind SALTILE decoders:
 * typed guards over decoded CBOR values (the type-aware lint requires
 * guards - `instanceof Map` and `Array.isArray` both narrow to `any`
 * containers), request-echo assertions, and slot-extent checks.
 */

import { SaltileWireError, type SaltileSlot } from "./saltile-wire";

import type { CborValue } from "./saltile-cbor";

/** Length of a generation identity in bytes (sha256). */
export const GENERATION_BYTES = 32;

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
