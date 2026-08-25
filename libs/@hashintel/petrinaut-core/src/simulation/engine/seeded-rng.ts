/**
 * Simple Linear Congruential Generator (LCG) for deterministic random numbers
 * Uses parameters from Numerical Recipes (same as glibc)
 *
 * Formula: next = (a * seed + c) mod m
 * where a = 1103515245, c = 12345, m = 2^31
 */

const LCG_A = 1103515245;
const LCG_C = 12345;
const LCG_M = 2147483648; // 2^31

/**
 * Generate next random number and update seed
 * Returns [randomValue, newSeed]
 * randomValue is in range [0, 1)
 */
export function nextRandom(seed: number): [number, number] {
  // `LCG_A * seed` overflows Number.MAX_SAFE_INTEGER, so plain float
  // arithmetic computes a *different* map than the LCG above: it diverges
  // from the exact recurrence on the first step and collapses the state
  // space to a short cycle (~16k states observed from seed 42), which
  // starves the distribution's tails. `Math.imul` is the product's exact low
  // 32 bits; masking to 31 bits is the exact `mod 2^31`.
  // eslint-disable-next-line no-bitwise -- exact `mod 2^31` on the 32-bit product
  const newSeed = (Math.imul(LCG_A, seed) + LCG_C) & (LCG_M - 1);
  const randomValue = newSeed / LCG_M;
  return [randomValue, newSeed];
}
