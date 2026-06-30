/* eslint-disable id-length, no-bitwise */
/**
 * Deterministic seeded PRNGs, so layouts that depend on randomness (annealing, jitter,
 * Louvain seeding) reproduce run to run with no dependence on Math.random.
 */

/**
 * mulberry32: a fast 32-bit PRNG returning a float in [0, 1). A given seed reproduces the
 * exact sequence, so a layout anneals or lays out identically run to run.
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
 * Park-Miller minimal-standard PRNG returning a float in (0, 1). A full-period
 * multiplicative generator, used to seed Louvain so community detection is reproducible.
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
