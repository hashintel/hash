import { createUserKeyedRecord } from "../../validation/record-keys";

import type { MonteCarloRunConfig } from "../../simulation/monte-carlo/types";
import type { Parameter } from "../../types/sdcpn";
import type { ExperimentRunPlan } from "../experiment-request";

/**
 * A boolean parameter's plan value `1`/`0` becomes the `"true"`/`"false"` the
 * engine's parser accepts; any other value is stringified as-is, so the parser
 * reports it against the parameter.
 */
const formatPlanValue = (
  value: number | undefined,
  type: Parameter["type"] | undefined,
): string => {
  if (type === "boolean") {
    if (value === 1) {
      return "true";
    }
    if (value === 0) {
      return "false";
    }
  }
  return String(value);
};

/**
 * A run plan as the engine's per-run configs.
 *
 * The engine and the shard slicing speak `MonteCarloRunConfig`; a plan is
 * expanded here, at the last step before the worker pool, so the pipeline
 * above never materializes a record per run.
 */
export const expandRunPlan = (
  plan: ExperimentRunPlan,
  runCount: number,
  parameters: readonly Parameter[],
): MonteCarloRunConfig[] => {
  const typeByName = new Map(
    parameters.map((parameter) => [parameter.variableName, parameter.type]),
  );
  const width = plan.ids.length;
  return Array.from({ length: runCount }, (_, run) => {
    const config: MonteCarloRunConfig = {};
    const seed = plan.seeds?.[run];
    if (seed !== undefined) {
      config.seed = seed;
    }
    if (width > 0) {
      const parameterValues = createUserKeyedRecord<string>();
      plan.ids.forEach((id, index) => {
        parameterValues[id] = formatPlanValue(
          plan.values[run * width + index],
          typeByName.get(id),
        );
      });
      config.parameterValues = parameterValues;
    }
    return config;
  });
};
