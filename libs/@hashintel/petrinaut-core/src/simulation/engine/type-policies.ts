import { formatUuid, NIL_UUID, toUuid } from "./uuid";

import type { ColorElementType, TokenAttributeValue } from "../../types/sdcpn";

/**
 * Physical (buffer-level) representation of one token attribute in the
 * packed-struct token layout:
 *
 * - `f64`: 8 bytes, 8-byte aligned (`real` and `integer` elements).
 * - `u8`: 1 byte, 1-byte aligned (`boolean` elements).
 * - `u64`: 8 bytes, 8-byte aligned (`string` elements — one little-endian
 *   64-bit ID into the simulation's `StringPool`, not the string itself).
 * - `u64x2`: 16 bytes, 8-byte aligned (`uuid` elements — two little-endian
 *   64-bit lanes: `lo` at the field's byteOffset, `hi` at +8).
 */
export type PhysicalKind = "f64" | "u8" | "u64" | "u64x2";

/**
 * JSON-serializable at-rest form of a token attribute value, as stored in
 * documents, scenario `per_place` rows, and compiled initial markings.
 * `uuid` bigints are stored as canonical lowercase 36-character strings;
 * every other type's runtime form is already JSON-safe.
 */
export type StoredTokenAttributeValue = number | boolean | string;

/**
 * Everything the rest of the codebase needs to know about one
 * `ColorElementType`, gathered in a single registry so adding a new element
 * type means filling in exactly one record (plus the genuinely structural
 * sites, e.g. uuid sentinel handling in `encode-kernel-token.ts`).
 *
 * `type-policies.test.ts` is the conformance test: it fails loudly when a
 * type is missing a policy or a policy is internally inconsistent.
 */
export type TypePolicy = {
  /** Physical layout kind in the packed token struct (see `token-layout.ts`). */
  physicalKind: PhysicalKind;
  /** Logical default value (runtime form). */
  defaultValue: TokenAttributeValue;
  /**
   * TS source expression producing a default value for this type in
   * generated default transition-kernel code (see `default-codes.ts`).
   */
  defaultValueSource: string;
  /** TS type string the LSP virtual files use for token *inputs*. */
  tsInputType: string;
  /**
   * TS type string the LSP virtual files use for transition-kernel *output*
   * token attributes. Mode-dependent widening (e.g. `real` accepting a
   * `Distribution` under stochasticity) stays in the generator.
   */
  tsKernelOutputType: string;
  /**
   * Whether kernel outputs may omit the attribute (`uuid` values are
   * auto-generated from the seeded simulation RNG when omitted).
   */
  kernelOutputOptional: boolean;
  /**
   * Coerces an arbitrary (non-nullish) value to this type's runtime form.
   * Throws with `context` when the value is not convertible; `uuid` and
   * `string` conversions are total and never throw.
   */
  coerce: (value: unknown, context: string) => TokenAttributeValue;
  /**
   * Decodes one number-slot (`f64` / `u8`) buffer value back into a logical
   * token attribute value, or `null` for types not stored in number slots
   * (`uuid` lanes and `string` pool references are decoded in
   * `token-layout.ts`).
   */
  decodeNumberSlot: ((encodedValue: number) => TokenAttributeValue) | null;
  /** Converts a runtime value to its JSON-serializable at-rest form. */
  encodeAtRest: (value: TokenAttributeValue) => StoredTokenAttributeValue;
  /**
   * Parses raw spreadsheet cell editor text into a runtime value. Total:
   * unparseable input falls back to a zero-ish value rather than throwing.
   */
  parseEditorText: (rawValue: string) => TokenAttributeValue;
};

/**
 * Every `ColorElementType`, in declaration order of the union. The canonical
 * runtime list — the zod colour element schema and the conformance test both
 * derive from it. `satisfies` keeps it in lockstep with the union (and
 * `TYPE_POLICIES` being a `Record` over the union guarantees the reverse
 * direction: a new union member without a policy fails to compile).
 */
export const COLOR_ELEMENT_TYPES = [
  "real",
  "integer",
  "boolean",
  "uuid",
  "string",
] as const satisfies readonly ColorElementType[];

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

/**
 * At-rest identity for types whose runtime form is already JSON-safe. Total
 * over `TokenAttributeValue`: a (well-typed-ly unreachable) bigint is
 * formatted rather than leaking into JSON.
 */
const storeVerbatim = (value: TokenAttributeValue): StoredTokenAttributeValue =>
  typeof value === "bigint" ? formatUuid(value) : value;

/**
 * Editor text → finite number. Pasting "Infinity" or overflowing notation
 * must not leak non-finite numbers into stored state (coercion rejects them
 * later); non-finite parses clamp to 0.
 */
function parseFiniteNumber(rawValue: string): number {
  const parsed = Number.parseFloat(rawValue);
  return Number.isFinite(parsed) ? parsed : 0;
}

export const TYPE_POLICIES: Record<ColorElementType, TypePolicy> = {
  real: {
    physicalKind: "f64",
    defaultValue: 0,
    defaultValueSource: "0",
    tsInputType: "number",
    tsKernelOutputType: "number",
    kernelOutputOptional: false,
    coerce: coerceNumber,
    decodeNumberSlot: (encodedValue) => encodedValue,
    encodeAtRest: storeVerbatim,
    parseEditorText: (rawValue) => parseFiniteNumber(rawValue),
  },
  integer: {
    physicalKind: "f64",
    defaultValue: 0,
    defaultValueSource: "0",
    tsInputType: "number",
    tsKernelOutputType: "number",
    kernelOutputOptional: false,
    coerce: (value, context) => Math.round(coerceNumber(value, context)),
    decodeNumberSlot: (encodedValue) => Math.round(encodedValue),
    encodeAtRest: storeVerbatim,
    parseEditorText: (rawValue) => Math.round(parseFiniteNumber(rawValue)),
  },
  boolean: {
    physicalKind: "u8",
    defaultValue: false,
    defaultValueSource: "false",
    tsInputType: "boolean",
    tsKernelOutputType: "boolean",
    kernelOutputOptional: false,
    coerce: coerceBoolean,
    decodeNumberSlot: (encodedValue) => encodedValue !== 0,
    encodeAtRest: storeVerbatim,
    parseEditorText: (rawValue) => {
      const normalized = rawValue.trim().toLowerCase();
      return normalized === "true" || normalized === "1";
    },
  },
  uuid: {
    physicalKind: "u64x2",
    defaultValue: NIL_UUID,
    defaultValueSource: "Uuid.generate()",
    tsInputType: "bigint",
    // uuid kernel outputs also accept UUID strings and the `Uuid.generate()`
    // / `Uuid.from(value)` sentinels.
    tsKernelOutputType: "bigint | string | PetrinautUuid",
    kernelOutputOptional: true,
    // Total conversion: bigints and UUID strings pass through/parse, and any
    // other value maps deterministically to a UUIDv5 — never throws.
    coerce: (value) => toUuid(value),
    decodeNumberSlot: null,
    // toUuid unconditionally: it passes in-range bigints through and maps
    // everything else (including out-of-range bigints) deterministically,
    // so the stored string is always a canonical UUID.
    encodeAtRest: (value) => formatUuid(toUuid(value)),
    // Valid UUID strings parse; anything else converts deterministically via
    // UUIDv5. Clearing the cell resets to the nil uuid.
    parseEditorText: (rawValue) => {
      const trimmed = rawValue.trim();
      return trimmed === "" ? NIL_UUID : toUuid(trimmed);
    },
  },
  string: {
    physicalKind: "u64",
    defaultValue: "",
    defaultValueSource: '""',
    tsInputType: "string",
    tsKernelOutputType: "string",
    kernelOutputOptional: false,
    // Total conversion: any value stringifies; nullish values resolve to the
    // default ("") before reaching this.
    coerce: (value) => (typeof value === "string" ? value : String(value)),
    decodeNumberSlot: null,
    encodeAtRest: storeVerbatim,
    // Identity — string cells keep the entered text verbatim (no trim).
    parseEditorText: (rawValue) => rawValue,
  },
};
