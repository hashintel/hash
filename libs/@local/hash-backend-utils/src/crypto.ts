import { timingSafeEqual } from "node:crypto";

/**
 * Constant-time string comparison to prevent timing attacks.
 *
 * Uses `crypto.timingSafeEqual` under the hood. Returns `false` if the strings
 * differ in length (which does leak length information, but not content).
 */
export function timingSafeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}
