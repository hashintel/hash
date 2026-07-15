import _Ajv from "ajv";

import { chartConfigSchema } from "./chart-config-schema.gen.js";

import type { ChartConfig } from "@local/hash-isomorphic-utils/dashboard-types";

const Ajv = _Ajv as unknown as typeof _Ajv.default;

const ajv = new Ajv();
const validateChartConfig = ajv.compile(chartConfigSchema);

/**
 * Validate a submitted config against the generated ChartConfig JSON schema,
 * and check that the keys it references actually exist in the data rows.
 * Returns a list of human-readable problems, empty if the config is valid.
 */
export const getChartConfigProblems = (
  config: unknown,
  dataKeys: string[],
): string[] => {
  const problems: string[] = [];

  if (!validateChartConfig(config)) {
    for (const error of validateChartConfig.errors ?? []) {
      problems.push(
        `Schema violation at "${error.instancePath || "(root)"}": ${error.message ?? "invalid"}`,
      );
    }
    return problems;
  }

  if (dataKeys.length > 0) {
    const typedConfig = config as ChartConfig;

    if (!dataKeys.includes(typedConfig.categoryKey)) {
      problems.push(
        `categoryKey "${typedConfig.categoryKey}" is not one of the data keys: ${dataKeys.join(", ")}`,
      );
    }

    for (const series of typedConfig.series) {
      if (!dataKeys.includes(series.dataKey)) {
        problems.push(
          `series dataKey "${series.dataKey}" is not one of the data keys: ${dataKeys.join(", ")}`,
        );
      }
    }
  }

  return problems;
};
