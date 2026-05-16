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
      type: "lognormal";
      mu: number;
      sigma: number;
    })
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
    },
    Lognormal: function(mu, sigma) {
      return __addMap({ __brand: "distribution", type: "lognormal", mu: mu, sigma: sigma });
    }
  };
`;
