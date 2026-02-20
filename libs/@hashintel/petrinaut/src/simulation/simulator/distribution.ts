import { nextRandom } from "./seeded-rng";

/**
 * Runtime representation of a probability distribution.
 * Created by user code via Distribution.Gaussian() or Distribution.Uniform(),
 * then sampled during transition kernel output resolution.
 */
export type RuntimeDistribution =
  | {
      __brand: "distribution";
      type: "gaussian";
      mean: number;
      deviation: number;
    }
  | { __brand: "distribution"; type: "uniform"; min: number; max: number };

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
  var Distribution = {
    Gaussian: function(mean, deviation) {
      return { __brand: "distribution", type: "gaussian", mean: mean, deviation: deviation };
    },
    Uniform: function(min, max) {
      return { __brand: "distribution", type: "uniform", min: min, max: max };
    }
  };
`;

/**
 * Samples a single numeric value from a distribution using the seeded RNG.
 *
 * @returns A tuple of [sampledValue, newRngState]
 */
export function sampleDistribution(
  distribution: RuntimeDistribution,
  rngState: number,
): [number, number] {
  switch (distribution.type) {
    case "gaussian": {
      // Box-Muller transform: converts two uniform random values to a standard normal
      const [u1, rng1] = nextRandom(rngState);
      const [u2, rng2] = nextRandom(rng1);
      const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      return [distribution.mean + z * distribution.deviation, rng2];
    }
    case "uniform": {
      const [sample, newRng] = nextRandom(rngState);
      return [
        distribution.min + sample * (distribution.max - distribution.min),
        newRng,
      ];
    }
  }
}
