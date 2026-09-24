/**
 * A study manifest's scenario parameter bindings split by kind: the values
 * the study holds fixed and the domains the optimizer moves. The sensitivity
 * panel and the fixtures read the optimized half.
 */
import type {
  PetrinautOptimizationInput,
  PetrinautOptimizationParameterBinding,
} from "@hashintel/petrinaut-core";
import type { OptimizationScalar } from "@hashintel/petrinaut-core/optimization";

export type OptimizeBinding = Extract<
  PetrinautOptimizationParameterBinding,
  { kind: "optimize" }
>;

/** The scenario's parameter bindings split by kind, each half in binding order. */
export type ParameterBindingPartition = {
  /** The parameters held constant, with their values. */
  fixed: Record<string, OptimizationScalar>;
  /** The parameters the optimizer moves, with their domains. */
  optimized: Record<string, OptimizeBinding>;
};

export const partitionParameterBindings = (
  input: Pick<PetrinautOptimizationInput, "scenario">,
): ParameterBindingPartition => {
  const fixed: Record<string, OptimizationScalar> = {};
  const optimized: Record<string, OptimizeBinding> = {};
  for (const [identifier, binding] of Object.entries(
    input.scenario.parameterBindings,
  )) {
    if (binding.kind === "fixed") {
      fixed[identifier] = binding.value;
    } else {
      optimized[identifier] = binding;
    }
  }
  return { fixed, optimized };
};
