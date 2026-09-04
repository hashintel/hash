import { PETRINAUT_OPTIMIZATION_MAX_SEED } from "@hashintel/petrinaut-core/optimization";

/**
 * A fresh study seed. Every study used to share one fixed seed, so two studies
 * over different models drew the same normalized positions for their random
 * start-up steps and painted the same surface. A draw per form keeps a study
 * reproducible through the field while making studies differ by default.
 */
export const randomOptimizationSeed = (): number =>
  Math.floor(Math.random() * (PETRINAUT_OPTIMIZATION_MAX_SEED + 1));

export const isValidOptimizationSeed = (seed: number | null): seed is number =>
  seed !== null &&
  Number.isInteger(seed) &&
  seed >= 0 &&
  seed <= PETRINAUT_OPTIMIZATION_MAX_SEED;
