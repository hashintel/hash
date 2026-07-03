/**
 * Sentinel values produced by the `Uuid` helper inside user code. They are
 * resolved during transition kernel output encoding:
 *
 * - `Uuid.generate()` → a fresh UUID drawn from the seeded simulation RNG
 *   (same draw as an omitted uuid output field).
 * - `Uuid.from(value)` → the total `toUuid` conversion of `value` (valid UUID
 *   strings parse; anything else maps deterministically via UUIDv5).
 */
export type UuidSentinel =
  | { __petrinautUuid: "generate" }
  | { __petrinautUuid: "from"; value: unknown };

/**
 * Checks if a value is a `Uuid.generate()` / `Uuid.from(value)` sentinel.
 */
export function isUuidSentinel(value: unknown): value is UuidSentinel {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const tag = (value as Record<string, unknown>).__petrinautUuid;
  return tag === "generate" || tag === "from";
}

/**
 * JavaScript source code that defines the `Uuid` namespace at runtime.
 * Injected unconditionally into the compiled user code execution context
 * (unlike `Distribution`, which is gated on the stochasticity extension) so
 * uuid token attributes can always be produced.
 */
export const uuidRuntimeCode = `
  var Uuid = {
    generate: function() {
      return { __petrinautUuid: "generate" };
    },
    from: function(value) {
      return { __petrinautUuid: "from", value: value };
    }
  };
`;
