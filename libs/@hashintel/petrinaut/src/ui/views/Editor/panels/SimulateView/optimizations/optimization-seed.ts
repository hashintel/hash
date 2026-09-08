import { PETRINAUT_OPTIMIZATION_MAX_SEED } from "@hashintel/petrinaut-core/optimization";

/**
 * A fresh study seed, drawn per form so studies differ by default while a
 * study stays reproducible through the field. The seed range is a power of
 * two, so reducing a uniform 32-bit draw into it leaves every value in
 * 0..PETRINAUT_OPTIMIZATION_MAX_SEED equally likely.
 */
export const randomOptimizationSeed = (): number =>
  crypto.getRandomValues(new Uint32Array(1))[0]! %
  (PETRINAUT_OPTIMIZATION_MAX_SEED + 1);

export const isValidOptimizationSeed = (seed: number | null): seed is number =>
  seed !== null &&
  Number.isInteger(seed) &&
  seed >= 0 &&
  seed <= PETRINAUT_OPTIMIZATION_MAX_SEED;
