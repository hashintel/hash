import "../../shared/testing-utilities/mock-get-flow-context";

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { LlmParams } from "./get-llm-response/types";
import { improveSystemPrompt } from "./optimize-system-prompt/improve-system-prompt";
import type {
  MetricDefinition,
  MetricResult,
  MetricResultsForModel,
  MetricResultsForSystemPrompt,
} from "./optimize-system-prompt/types";

const escapeCSV = (value: string) => {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
};

const saveResultsToCSV = (params: {
  directoryPath: string;
  fileName: string;
  results: MetricResultsForSystemPrompt[];
}) => {
  const { results, directoryPath, fileName } = params;

  const headers = [
    "Iteration",
    "Model",
    "System Prompt",
    "Metric Name",
    "Score",
    "Natural Language Report",
    "Encountered Error",
    "Additional Info",
  ];

  const rows = results.flatMap(
    ({ systemPrompt, iteration, metricResultsForModels }) =>
      metricResultsForModels.flatMap(({ model, metricResults }) =>
        metricResults.map(({ metric, result }) => [
          iteration.toString(),
          escapeCSV(model),
          escapeCSV(systemPrompt),
          escapeCSV(metric.name),
          result.score.toString(),
          escapeCSV(result.naturalLanguageReport),
          result.encounteredError
            ? escapeCSV(result.encounteredError.status)
            : "",
          result.additionalInfo
            ? escapeCSV(JSON.stringify(result.additionalInfo, null, 2))
            : "",
        ]),
      ),
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

  const runStartTimestamp = new Date().toISOString();

  const results: MetricResultsForSystemPrompt[] = [];

  let currentSystemPrompt = initialSystemPrompt;
  let currentIteration = 0;

  if (!existsSync(directoryPath)) {
    mkdirSync(directoryPath, { recursive: true });
  }

  while (currentIteration < numberOfIterations) {
    const metricResultsForModels = await runMetricsForModels({
      metrics,
      models,
      systemPrompt: currentSystemPrompt,
    });

    results.push({
      systemPrompt: currentSystemPrompt,
      iteration: currentIteration,
      metricResultsForModels,
    });

    saveResultsToCSV({
      directoryPath,
      fileName: `results-${runStartTimestamp}`,
      results,
    });

    const { updatedSystemPrompt } = await improveSystemPrompt({
      previousSystemPrompt: currentSystemPrompt,
      results,
    });

    currentSystemPrompt = updatedSystemPrompt;

    currentIteration += 1;
  }
};
