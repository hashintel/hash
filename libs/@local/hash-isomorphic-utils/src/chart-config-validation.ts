import { chartConfigSchema } from "./chart-config-schema.js";
import { validateDataAgainstSchema } from "./json-utils.js";

import type { ChartConfig } from "./dashboard-types.js";
import type { Schema } from "jsonschema";

// oxlint-disable-next-line typescript/no-restricted-types -- bridges the readonly generated schema literal to the mutable jsonschema `Schema`
const rawChartSchema: unknown = chartConfigSchema;

// SAFETY: the generated schema is a plain JSON schema object, structurally a jsonschema `Schema`.
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- narrowing from the unknown bridge above
const chartJsonSchema = rawChartSchema as Schema;

/**
 * Validate a chart config against the generated schema and, when available,
 * check that its referenced keys exist in the chart data.
 */
export const getChartConfigProblems = (
  // oxlint-disable-next-line typescript/no-restricted-types -- the config is untrusted input that this function validates
  config: unknown,
  dataKeys: string[],
): string[] => {
  const validationResult = validateDataAgainstSchema(config, chartJsonSchema);

  if (!validationResult.valid) {
    return validationResult.errors.map(
      ({ stack }) => `Schema violation: ${stack}`,
    );
  }

  const problems: string[] = [];
  // SAFETY: the config was validated against the chart config schema above.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- validated against the schema generated from `ChartConfig` just above
  const typedConfig = config as ChartConfig;

  if (typedConfig.series.length === 0) {
    problems.push("series must contain at least one chart series");
  }

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
