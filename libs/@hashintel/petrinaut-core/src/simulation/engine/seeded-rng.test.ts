import { describe, expect, it } from "vitest";

import { nextRandom } from "./seeded-rng";

describe("nextRandom", () => {
  it("computes the exact LCG recurrence (no float overflow)", () => {
    // Reference implementation in arbitrary-precision arithmetic. The float
    // product `a * seed` overflows 2^53, so an inexact implementation
    // diverges from this on the first step.
    let reference = 42n;
    let seed = 42;
    for (let step = 0; step < 10_000; step++) {
      reference = (1103515245n * reference + 12345n) % 2147483648n;
      const [value, newSeed] = nextRandom(seed);
      seed = newSeed;
      expect(seed).toBe(Number(reference));
      expect(value).toBe(Number(reference) / 2147483648);
    }
  });

  it("does not collapse into a short cycle", () => {
    // The inexact map cycled after ~16k states, starving distribution tails.
    const seen = new Set<number>();
    let seed = 42;
    for (let step = 0; step < 100_000; step++) {
      [, seed] = nextRandom(seed);
      expect(seen.has(seed)).toBe(false);
      seen.add(seed);
    }
  });

  // 100k draws with two assertions each takes ~5s alone and longer under
  // suite parallelism, past vitest's 5s default.
  it(
    "draws values in [0, 1) with a healthy upper tail",
    { timeout: 30_000 },
    () => {
      let seed = 7;
      let above = 0;
      const draws = 100_000;
      for (let step = 0; step < draws; step++) {
        const [value, newSeed] = nextRandom(seed);
        seed = newSeed;
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(1);
        if (value > 0.98) above += 1;
      }
      // Expect ~2% ± 4 binomial standard deviations.
      expect(Math.abs(above - draws * 0.02)).toBeLessThanOrEqual(
        4 * Math.sqrt(draws * 0.02 * 0.98),
      );
    },
  );
});
