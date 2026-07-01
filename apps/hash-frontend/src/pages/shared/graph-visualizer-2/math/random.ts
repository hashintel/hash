/* eslint-disable id-length, no-bitwise */
/** Deterministic seeded PRNGs for reproducible layouts. */

/**
 * mulberry32: a 32-bit PRNG. Returns a float in [0, 1).
 *
 * A given seed always produces the same sequence.
 */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Park-Miller minimal-standard PRNG. Returns a float in (0, 1);
 * never returns exactly 0 or 1.
 *
 * Full-period: cycles through all 2^31 - 2 values before repeating.
 */
export function parkMillerRng(seed: number): () => number {
  let state = seed % 2147483647;
  if (state <= 0) {
    state += 2147483646;
  }

  return () => {
    state = (state * 48271) % 2147483647;
    return state / 2147483647;
  };
}

/**
 * Fisher-Yates shuffle driven by an xorshift PRNG.
 * Returns a new array; the input is not mutated.
 */
export function deterministicShuffle(
  indices: number[],
  seed: number,
): number[] {
  const result = [...indices];
  let state = seed * 0x9e3779b9;

  for (let idx = result.length - 1; idx > 0; idx--) {
    state = (state ^ (state << 13)) | 0;
    state = (state ^ (state >>> 17)) | 0;
    state = (state ^ (state << 5)) | 0;
    const target = (state >>> 0) % (idx + 1);
    const temp = result[idx]!;
    result[idx] = result[target]!;
    result[target] = temp;
  }

  return result;
}
