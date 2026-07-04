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

// Distribution construction for compiled user code lives in
// `hir/instantiate.ts` (`hirDistributionRuntime`) — emitted programs call it
// through the injected `__dist` binding instead of injected source code.
