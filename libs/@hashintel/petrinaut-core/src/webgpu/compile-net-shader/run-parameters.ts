/**
 * Parameters whose value varies per run.
 *
 * A baked parameter is a WGSL literal; a per-run parameter is read from a
 * run-major f32 buffer at binding 4 into a local the emitters reference by
 * name.
 */
import { WgslBailError } from "../emit-wgsl";

import type { WgslParameterValue } from "../emit-wgsl";

export type RunParameterPlan = {
  ids: readonly string[];
  /** Parameter values as the emitters see them: literals, or per-run locals. */
  emitterParameterValues: Readonly<Record<string, WgslParameterValue>>;
};

export const planRunParameters = (
  runParameters: readonly string[],
  parameterValues: Readonly<Record<string, number | boolean>>,
): RunParameterPlan => {
  for (const name of runParameters) {
    const value = parameterValues[name];
    if (value === undefined) {
      throw new WgslBailError(
        `per-run parameter \`${name}\` is not a parameter of this net`,
      );
    }
    if (typeof value !== "number") {
      throw new WgslBailError(
        `per-run parameter \`${name}\` is not numeric; only numeric parameters can vary per run`,
      );
    }
  }
  return {
    ids: runParameters,
    emitterParameterValues: {
      ...parameterValues,
      ...Object.fromEntries(
        runParameters.map((name, index) => [
          name,
          { perRun: `run_param_${index}` },
        ]),
      ),
    },
  };
};

/** The storage binding, when any parameter varies per run. */
export const runParameterBindingLines = (plan: RunParameterPlan): string[] =>
  plan.ids.length === 0
    ? []
    : [`@group(0) @binding(4) var<storage, read> run_params: array<f32>;`];

/** One local per per-run parameter, declared before the run's state loads. */
export const runParameterLocalLines = (plan: RunParameterPlan): string[] =>
  plan.ids.map((_, index) => `  var run_param_${index}: f32 = 0.0;`);

/** Loads each local from the run's slice of the buffer. */
export const runParameterLoadLines = (plan: RunParameterPlan): string[] =>
  plan.ids.map(
    (_, index) =>
      `    run_param_${index} = run_params[run_index * ${plan.ids.length}u + ${index}u];`,
  );
