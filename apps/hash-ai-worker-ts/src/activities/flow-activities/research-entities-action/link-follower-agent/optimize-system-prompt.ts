import "../../../../shared/testing-utilities/mock-get-flow-context";

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { LlmParams } from "../../../shared/get-llm-response/types";
import { improveSystemPrompt } from "./optimize-system-prompt/improve-system-prompt";
import type {
  MetricDefinition,
  MetricResult,
  MetricResultsForModel,
} from "./optimize-system-prompt/types";

type MetricResultsForModelWithIteration = MetricResultsForModel & {
  iteration: number;
};

const escapeCSV = (value: string) => {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
};

const saveResultsToCSV = (params: {
  directoryPath: string;
  fileName: string;
  results: MetricResultsForModelWithIteration[];
}) => {
  const { results, directoryPath, fileName } = params;

  const headers = [
    "Iteration",
    "Model",
    "System Prompt",
    "Metric Name",
    "Maximum Score",
    "Score",
    "Natural Language Report",
    "Encountered Error",
    "Additional Info",
  ];

  const rows = results.map(({ metricResults, iteration }) =>
    metricResults.map(({ metric, result }) => [
      iteration.toString(),
      escapeCSV(result.testingParams.model),
      escapeCSV(result.testingParams.systemPrompt),
      escapeCSV(metric.name),
      metric.maximumScore.toString(),
      result.score.toString(),
      escapeCSV(result.naturalLanguageReport),
      result.encounteredError ? escapeCSV(result.encounteredError.status) : "",
      result.additionalInfo
        ? escapeCSV(JSON.stringify(result.additionalInfo, null, 2))
        : "",
    ]),
  );

  const csvContent = [headers, ...rows].map((row) => row.join(",")).join("\n");

  const filePath = join(directoryPath, `${fileName}.csv`);

  writeFileSync(filePath, csvContent, "utf8");
};

const runMetricsForModels = async (params: {
  metrics: MetricDefinition[];
  models: LlmParams["model"][];
  systemPrompt: string;
}): Promise<MetricResultsForModel[]> => {
  const { metrics, models, systemPrompt } = params;

  const results = await Promise.all(
    models.map(async (model) => {
      const metricResults = await Promise.all<{
        metric: MetricDefinition;
        result: MetricResult;
      }>(
        metrics.map(async (metricDefinition) => {
          const result = await metricDefinition.executeMetric({
            testingParams: {
              model,
              systemPrompt,
            },
          });

          return {
            metric: metricDefinition,
            result,
          };
        }),
      );

      return { metricResults, model };
    }),
  );

  return results;
};

export const optimizeSystemPrompt = async (params: {
  models: LlmParams["model"][];
  metrics: MetricDefinition[];
  initialSystemPrompt: string;
  numberOfIterations: number;
  directoryPath: string;
}) => {
  const {
    metrics,
    models,
    initialSystemPrompt,
    numberOfIterations,
    directoryPath,
  } = params;

  let systemPrompt = initialSystemPrompt;
  let currentIteration = 0;

  const allResults: MetricResultsForModelWithIteration[] = [];

  if (!existsSync(directoryPath)) {
    mkdirSync(directoryPath, { recursive: true });
  }

  while (currentIteration < numberOfIterations) {
    const results = await runMetricsForModels({
      metrics,
      models,
      systemPrompt,
    });

    // eslint-disable-next-line no-loop-func
    const resultsWithIteration = results.map((result) => ({
      ...result,
      iteration: currentIteration,
    }));

    allResults.push(...resultsWithIteration);

    saveResultsToCSV({
      directoryPath,
      /** @todo: generate name based on timestamp */
      fileName: "results",
      results: allResults,
    });

    const { updatedSystemPrompt } = await improveSystemPrompt({
      previousSystemPrompt: systemPrompt,
      results,
    });

    systemPrompt = updatedSystemPrompt;

    currentIteration += 1;
  }
};
