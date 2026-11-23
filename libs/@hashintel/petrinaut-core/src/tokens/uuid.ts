import { v5 as uuidv5 } from "uuid";

/**
 * Runtime representation of `uuid` token elements: one `bigint` holding the
 * full 128-bit RFC 4122 value (0 ≤ v < 2^128). At rest (documents, scenario
 * JSON) uuid values are canonical lowercase 36-character strings; in frame
 * buffers they are stored as two little-endian 64-bit lanes (see
 * `token-layout.ts`).
 */

/** The nil UUID (`00000000-0000-0000-0000-000000000000`). */
export const NIL_UUID = 0n;

/**
 * Fixed UUIDv5 namespace under which non-UUID inputs (numbers, arbitrary
 * strings, …) are deterministically converted to UUIDs via `toUuid`.
 *
 * This value MUST NEVER change: converted UUIDs are persisted in documents
 * and simulation results, and changing the namespace would silently remap
 * every previously derived identifier.
 */
export const PETRINAUT_UUID_NAMESPACE = "6d5b6d5e-3c1b-4f7e-9c39-4b6f1e2a8d90";

const UUID_STRING_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const UUID_MAX = 2n ** 128n; // 2^128

/** Whether `value` is a 36-character hyphenated UUID string (any case). */
export function isUuidString(value: unknown): value is string {
  return typeof value === "string" && UUID_STRING_RE.test(value);
}

/**
 * Parses a canonical 36-character UUID string (any case) into its 128-bit
 * bigint value. Throws on malformed input — use `toUuid` for a total
 * conversion.
 */
export function parseUuid(value: string): bigint {
  if (!UUID_STRING_RE.test(value)) {
    throw new Error(`Invalid UUID string: ${value}`);
  }
  return BigInt(`0x${value.replaceAll("-", "")}`);
}

/**
 * Total coercion of any value to a 128-bit uuid bigint. Never throws:
 *
 * - in-range `bigint` (0 ≤ v < 2^128) → itself;
 * - valid UUID string (any case) → parsed value;
 * - `undefined` / `null` → the nil UUID (`0n`);
 * - anything else (numbers, arbitrary strings, out-of-range bigints, …) →
 *   the UUIDv5 of `String(value)` under {@link PETRINAUT_UUID_NAMESPACE},
 *   so the same input always maps to the same UUID.
 */
export function toUuid(value: unknown): bigint {
  if (typeof value === "bigint" && value >= 0n && value < UUID_MAX) {
    return value;
  }
  if (isUuidString(value)) {
    return parseUuid(value);
  }
  if (value === undefined || value === null) {
    return NIL_UUID;
  }
  // eslint-disable-next-line typescript/no-base-to-string -- intentional: non-primitives map through their default stringification, keeping the conversion total and deterministic
  return parseUuid(uuidv5(String(value), PETRINAUT_UUID_NAMESPACE));
}

/**
 * Formats a 128-bit bigint as the canonical lowercase 36-character UUID
 * string (padded 32 hex digits + hyphens). Total: an out-of-range bigint
 * (negative or ≥ 2^128) is first canonicalized through {@link toUuid} — the
 * same deterministic mapping every other non-uuid input takes — rather than
 * rendering a malformed string.
 */
export function formatUuid(value: bigint): string {
  const canonical = value >= 0n && value < UUID_MAX ? value : toUuid(value);
  const hex = canonical.toString(16).padStart(32, "0");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
