import { nextRandom } from "./seeded-rng";

type DistributionBase = {
  __brand: "distribution";
  /** Cached sampled value. Set after first sample so that multiple
   *  `.map()` calls on the same distribution share one draw. */
  sampledValue?: number;
};

/**
 * Runtime representation of a probability distribution.
 * Created by user code via Distribution.Gaussian() or Distribution.Uniform(),
 * then sampled during transition kernel output resolution.
 */
export type RuntimeDistribution =
  | (DistributionBase & {
      type: "gaussian";
      mean: number;
      deviation: number;
    })
  | (DistributionBase & { type: "uniform"; min: number; max: number })
  | (DistributionBase & {
      type: "mapped";
      inner: RuntimeDistribution;
      fn: (value: number) => number;
    });

/**
 * Checks if a value is a RuntimeDistribution object.
 */
export function isDistribution(value: unknown): value is RuntimeDistribution {
  return (
    typeof value === "object" &&
    value !== null &&
    "__brand" in value &&
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    (value as Record<string, unknown>).__brand === "distribution"
  );
}

/**
 * JavaScript source code that defines the Distribution namespace at runtime.
 * Injected into the compiled user code execution context so that
 * Distribution.Gaussian() and Distribution.Uniform() are available.
 */
export const distributionRuntimeCode = `
  function __addMap(dist) {
    dist.map = function(fn) {
      return __addMap({ __brand: "distribution", type: "mapped", inner: dist, fn: fn });
    };
    return dist;
  }
  var Distribution = {
    Gaussian: function(mean, deviation) {
      return __addMap({ __brand: "distribution", type: "gaussian", mean: mean, deviation: deviation });
    },
    Uniform: function(min, max) {
      return __addMap({ __brand: "distribution", type: "uniform", min: min, max: max });
    }
  };
`;

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
      // Box-Muller transform: converts two uniform random values to a standard normal
      const [u1, rng1] = nextRandom(rngState);
      const [u2, rng2] = nextRandom(rng1);
      const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
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

  distribution.sampledValue = value;
  return [value, nextRng];
}
