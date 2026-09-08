import { PETRINAUT_OPTIMIZATION_MAX_SEED } from "@hashintel/petrinaut-core/optimization";

/**
 * A fresh study seed, drawn per form so studies differ by default while a
 * study stays reproducible through the field. The seed range is one below a
 * power of two, so masking a uniform 32-bit draw with it leaves every value in
 * 0..PETRINAUT_OPTIMIZATION_MAX_SEED equally likely, where a modulo would not.
 */
export const randomOptimizationSeed = (): number =>
  // eslint-disable-next-line no-bitwise -- the mask is the unbiased reduction of the draw
  crypto.getRandomValues(new Uint32Array(1))[0]! &
  PETRINAUT_OPTIMIZATION_MAX_SEED;

export const isValidOptimizationSeed = (seed: number | null): seed is number =>
  seed !== null &&
  Number.isInteger(seed) &&
  seed >= 0 &&
  seed <= PETRINAUT_OPTIMIZATION_MAX_SEED;
