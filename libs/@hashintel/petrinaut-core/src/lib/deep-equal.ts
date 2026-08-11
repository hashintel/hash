import type { SDCPN } from "../types/sdcpn";

/**
 * Recursively compare two values for structural equality.
 *
 * Handles primitives, arrays, and plain objects. Does not handle
 * special types like Date, RegExp, Map, Set, etc. — those are not
 * used in SDCPN definitions.
 *
 * A key whose value is `undefined` is treated as absent, matching JSON
 * semantics. SDCPN definitions are persisted as JSON, which drops such keys,
 * so `{ metrics: undefined }` and `{}` describe the same saved document.
 */
const deepEqual = (a: unknown, b: unknown): boolean => {
  // Same reference or identical primitive
  if (a === b) {
    return true;
  }

  // Different types can never be equal
  if (typeof a !== typeof b) {
    return false;
  }

  // One is null but not the other (both-null is caught by `a === b` above)
  if (a === null || b === null) {
    return false;
  }

  // Compare arrays element-by-element
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) {
      return false;
    }
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) {
        return false;
      }
    }
    return true;
  }

  // Compare plain objects by own properties
  if (typeof a === "object") {
    const objA = a as Record<string, unknown>;
    const objB = b as Record<string, unknown>;

    // `undefined` values are ignored, so that a key set to `undefined` and a
    // key that was never set compare as equal
    const propsA = Object.getOwnPropertyNames(objA).filter(
      (prop) => objA[prop] !== undefined,
    );
    const propsB = Object.getOwnPropertyNames(objB).filter(
      (prop) => objB[prop] !== undefined,
    );

    // Different number of properties means not equal
    if (propsA.length !== propsB.length) {
      return false;
    }

    // Every defined property in `a` must be defined in `b` with the same value
    for (const prop of propsA) {
      if (!deepEqual(objA[prop], objB[prop])) {
        return false;
      }
    }

    return true;
  }

  return false;
};

/**
 * Check if two SDCPN definitions are structurally identical.
 *
 * Performs a recursive deep comparison of all fields, so that
 * additions to the SDCPN type are automatically covered.
 */
export const isSDCPNEqual = (a: SDCPN, b: SDCPN): boolean => deepEqual(a, b);
