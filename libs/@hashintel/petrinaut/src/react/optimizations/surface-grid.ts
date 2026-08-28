/**
 * Quantized navigation space over an optimization study's optimized
 * parameters, mirroring the experiments' sweep axes but built from the
 * study's parameter domains: continuous domains honour their log scale by
 * quantizing in log space, and integer domains snap to their declared step.
 * Boolean domains have no axis — there is nothing to slide.
 */
import type {
  PetrinautOptimizationInput,
  PetrinautOptimizationParameterBinding,
} from "@hashintel/petrinaut-core";

type OptimizeBinding = Extract<
  PetrinautOptimizationParameterBinding,
  { kind: "optimize" }
>;
type NumericDomain = Extract<
  OptimizeBinding["domain"],
  { kind: "continuous" } | { kind: "integer" }
>;

/** Quantization steps per axis; integer domains use one step per domain step. */
export const OPTIMIZATION_AXIS_STEPS = 50;

export type OptimizationSurfaceAxis = {
  identifier: string;
  domain: NumericDomain;
  /** Positions run 0..stepCount inclusive. */
  stepCount: number;
};

/** The navigable axes of a study: its non-boolean optimized parameters. */
export function buildOptimizationSurfaceAxes(
  input: PetrinautOptimizationInput,
): OptimizationSurfaceAxis[] {
  const axes: OptimizationSurfaceAxis[] = [];
  for (const [identifier, binding] of Object.entries(
    input.scenario.parameterBindings,
  )) {
    if (binding.kind !== "optimize" || binding.domain.kind === "boolean") {
      continue;
    }
    const domain = binding.domain;
    const stepCount =
      domain.kind === "integer"
        ? Math.min(
            OPTIMIZATION_AXIS_STEPS,
            Math.round((domain.maximum - domain.minimum) / domain.step),
          )
        : OPTIMIZATION_AXIS_STEPS;
    axes.push({ identifier, domain, stepCount });
  }
  return axes;
}

/** Strips float artifacts (e.g. 0.30000000000000004) from mapped values. */
function normalizeValue(value: number): number {
  return Number(value.toPrecision(12));
}

/** The domain value at a quantized position (0..stepCount). */
export function optimizationAxisValueAt(
  axis: OptimizationSurfaceAxis,
  position: number,
): number {
  const { domain, stepCount } = axis;
  const fraction = Math.min(Math.max(position, 0), stepCount) / stepCount;

  if (domain.kind === "integer") {
    const totalSteps = Math.round(
      (domain.maximum - domain.minimum) / domain.step,
    );
    const stepIndex =
      domain.scale === "log"
        ? Math.round(
            (Math.exp(
              Math.log(domain.minimum) +
                (Math.log(domain.maximum) - Math.log(domain.minimum)) *
                  fraction,
            ) -
              domain.minimum) /
              domain.step,
          )
        : Math.round(totalSteps * fraction);
    return domain.minimum + domain.step * Math.min(stepIndex, totalSteps);
  }

  if (domain.scale === "log") {
    return normalizeValue(
      Math.exp(
        Math.log(domain.minimum) +
          (Math.log(domain.maximum) - Math.log(domain.minimum)) * fraction,
      ),
    );
  }
  return normalizeValue(
    domain.minimum + (domain.maximum - domain.minimum) * fraction,
  );
}

/** The quantized position nearest to `value` (0..stepCount). */
export function optimizationAxisPositionFor(
  axis: OptimizationSurfaceAxis,
  value: number,
): number {
  const { domain, stepCount } = axis;
  const clamped = Math.min(Math.max(value, domain.minimum), domain.maximum);
  const fraction =
    domain.scale === "log"
      ? (Math.log(clamped) - Math.log(domain.minimum)) /
        (Math.log(domain.maximum) - Math.log(domain.minimum))
      : (clamped - domain.minimum) / (domain.maximum - domain.minimum);
  return Math.min(Math.max(Math.round(fraction * stepCount), 0), stepCount);
}

/** The middle of a domain, as a starting position before any trial exists. */
export function optimizationAxisMidpoint(
  axis: OptimizationSurfaceAxis,
): number {
  return Math.round(axis.stepCount / 2);
}
