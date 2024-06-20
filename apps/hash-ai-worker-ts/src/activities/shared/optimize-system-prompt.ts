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

const saveAllResultsToCSV = (params: {
  directoryPath: string;
  filePrefix: string;
  results: MetricResultsForSystemPrompt[];
}) => {
  const { results, directoryPath, filePrefix } = params;

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

  const filePath = join(directoryPath, `${filePrefix}-metric-results.csv`);

  writeFileSync(filePath, csvContent, "utf8");
};

const saveSummaryToCSV = (params: {
  results: MetricResultsForSystemPrompt[];
  directoryPath: string;
  filePrefix: string;
}) => {
  const { results, directoryPath, filePrefix } = params;

  const models = results
    .flatMap(({ metricResultsForModels }) =>
      metricResultsForModels.map(({ model }) => model),
    )
    .filter((value, index, all) => all.indexOf(value) === index);

  const metrics = results
    .flatMap(({ metricResultsForModels }) =>
      metricResultsForModels.flatMap(({ metricResults }) =>
        metricResults.map(({ metric }) => metric),
      ),
    )
    .filter(
      (metric, index, all) =>
        all.findIndex(({ name }) => metric.name === name) === index,
    );

  const headers = [
    "Iteration",
    "System Prompt",
    ...models.map((model) => `Average Score for ${model}`),
    ...metrics.map((metric) => `Average Score for ${metric.name}`),
  ];

  const rows = results.map(
    ({ systemPrompt, iteration, metricResultsForModels }) => {
      const modelAverageScores = models.map((model) => {
        const scores = metricResultsForModels
          .filter(({ model: currentModel }) => currentModel === model)
          .flatMap(({ metricResults }) =>
            metricResults.map(({ result }) => result.score),
          );

        return scores.reduce((acc, score) => acc + score, 0) / scores.length;
      });

      const metricAverageScores = metrics.map((metric) => {
        const scores = metricResultsForModels.flatMap(({ metricResults }) => {
          const result = metricResults.find(
            ({ metric: currentMetric }) => currentMetric === metric,
          );

          return result ? [result.result.score] : [];
        });

        return scores.reduce((acc, score) => acc + score, 0) / scores.length;
      });

      return [
        iteration.toString(),
        escapeCSV(systemPrompt),
        ...modelAverageScores.map((score) => score.toString()),
        ...metricAverageScores.map((score) => score.toString()),
      ];
    },
  );

  const csvContent = [headers, ...rows].map((row) => row.join(",")).join("\n");

  const filePath = join(directoryPath, `${filePrefix}-summary.csv`);

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

    saveAllResultsToCSV({
      directoryPath,
      filePrefix: runStartTimestamp,
      results,
    });

    saveSummaryToCSV({
      results,
      directoryPath,
      filePrefix: runStartTimestamp,
    });

    const { updatedSystemPrompt } = await improveSystemPrompt({
      previousSystemPrompt: currentSystemPrompt,
      results,
    });

    currentSystemPrompt = updatedSystemPrompt;

    currentIteration += 1;
  }
};
