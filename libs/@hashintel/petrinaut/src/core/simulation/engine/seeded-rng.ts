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
  const newSeed = (LCG_A * seed + LCG_C) % LCG_M;
  const randomValue = newSeed / LCG_M;
  return [randomValue, newSeed];
}
