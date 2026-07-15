import { chartConfigSchema } from "./chart-config-schema.js";
import { validateDataAgainstSchema } from "./json-utils.js";

import type { ChartConfig } from "./dashboard-types.js";
import type { Schema } from "jsonschema";

/**
 * Validate a chart config against the generated schema and, when available,
 * check that its referenced keys exist in the chart data.
 */
export const getChartConfigProblems = (
  config: unknown,
  dataKeys: string[],
): string[] => {
  const validationResult = validateDataAgainstSchema(
    config,
    chartConfigSchema as unknown as Schema,
  );

  if (!validationResult.valid) {
    return validationResult.errors.map(
      ({ stack }) => `Schema violation: ${stack}`,
    );
  }

  const problems: string[] = [];
  const typedConfig = config as ChartConfig;

  if (dataKeys.length > 0) {
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
