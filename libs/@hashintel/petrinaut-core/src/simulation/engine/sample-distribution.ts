import { nextRandom, type RandomStream } from "./seeded-rng";

import type { RuntimeDistribution } from "../authoring/user-code/distribution";

/**
 * Samples a single numeric value from a distribution, drawing from and
 * advancing `stream`. Caches the result on the distribution object so that
 * sibling `.map()` calls sharing the same inner distribution get a coherent
 * sample.
 */
export function sampleDistribution(
  distribution: RuntimeDistribution,
  stream: RandomStream,
): number {
  if (distribution.sampledValue !== undefined) {
    return distribution.sampledValue;
  }

  let value: number;

  switch (distribution.type) {
    case "gaussian": {
      // Box-Muller transform: converts two uniform random values to a standard normal.
      const u1 = nextRandom(stream);
      const u2 = nextRandom(stream);
      const z = Math.sqrt(-2 * Math.log(1 - u1)) * Math.cos(2 * Math.PI * u2);
      value = distribution.mean + z * distribution.deviation;
      break;
    }
    case "uniform": {
      const sample = nextRandom(stream);
      value = distribution.min + sample * (distribution.max - distribution.min);
      break;
    }
    case "lognormal": {
      // Lognormal(μ, σ): if X ~ Normal(μ, σ), then e^X ~ Lognormal(μ, σ).
      const u1 = nextRandom(stream);
      const u2 = nextRandom(stream);
      const z = Math.sqrt(-2 * Math.log(1 - u1)) * Math.cos(2 * Math.PI * u2);
      value = Math.exp(distribution.mu + z * distribution.sigma);
      break;
    }
    case "mapped": {
      value = distribution.fn(sampleDistribution(distribution.inner, stream));
      break;
    }
  }

  // eslint-disable-next-line no-param-reassign -- intentional: cache sampled value for coherent .map() siblings
  distribution.sampledValue = value;
  return value;
}
