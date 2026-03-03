import type { SDCPN } from "../core/types/sdcpn";

/**
 * Recursively compare two values for structural equality.
 *
 * Handles primitives, arrays, and plain objects. Does not handle
 * special types like Date, RegExp, Map, Set, etc. — those are not
 * used in SDCPN definitions.
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

    const propsA = Object.getOwnPropertyNames(objA);
    const propsB = Object.getOwnPropertyNames(objB);

    // Different number of properties means not equal
    if (propsA.length !== propsB.length) {
      return false;
    }

    // Every property in `a` must exist in `b` with the same value
    for (const prop of propsA) {
      if (
        !Object.prototype.hasOwnProperty.call(objB, prop) ||
        !deepEqual(objA[prop], objB[prop])
      ) {
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
