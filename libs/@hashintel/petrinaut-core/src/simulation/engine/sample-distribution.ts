import { nextRandom } from "./seeded-rng";

import type { RuntimeDistribution } from "../authoring/user-code/distribution";

/**
 * Samples a single numeric value from a distribution using the seeded RNG.
 * Caches the result on the distribution object so that sibling `.map()` calls
 * sharing the same inner distribution get a coherent sample.
 *
 * @returns A tuple of [sampledValue, newRngState]
 */
export function sampleDistribution(
  distribution: RuntimeDistribution,
  rngState: number,
): [number, number] {
  if (distribution.sampledValue !== undefined) {
    return [distribution.sampledValue, rngState];
  }

  let value: number;
  let nextRng: number;

  switch (distribution.type) {
    case "gaussian": {
      // Box-Muller transform: converts two uniform random values to a standard normal.
      const [u1, rng1] = nextRandom(rngState);
      const [u2, rng2] = nextRandom(rng1);
      const z = Math.sqrt(-2 * Math.log(1 - u1)) * Math.cos(2 * Math.PI * u2);
      value = distribution.mean + z * distribution.deviation;
      nextRng = rng2;
      break;
    }
    case "uniform": {
      const [sample, newRng] = nextRandom(rngState);
      value = distribution.min + sample * (distribution.max - distribution.min);
      nextRng = newRng;
      break;
    }
    case "lognormal": {
      // Lognormal(μ, σ): if X ~ Normal(μ, σ), then e^X ~ Lognormal(μ, σ).
      const [u1, rng1] = nextRandom(rngState);
      const [u2, rng2] = nextRandom(rng1);
      const z = Math.sqrt(-2 * Math.log(1 - u1)) * Math.cos(2 * Math.PI * u2);
      value = Math.exp(distribution.mu + z * distribution.sigma);
      nextRng = rng2;
      break;
    }
    case "mapped": {
      const [innerValue, newRng] = sampleDistribution(
        distribution.inner,
        rngState,
      );
      value = distribution.fn(innerValue);
      nextRng = newRng;
      break;
    }
  }

  // eslint-disable-next-line no-param-reassign -- intentional: cache sampled value for coherent .map() siblings
  distribution.sampledValue = value;
  return [value, nextRng];
}
