import "../../shared/testing-utilities/mock-get-flow-context.js";

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { LlmParams } from "./get-llm-response/types.js";
import { improveSystemPrompt } from "./optimize-system-prompt/improve-system-prompt.js";
import type {
  MetricDefinition,
  MetricResultsForModel,
  MetricResultsForSystemPrompt,
} from "./optimize-system-prompt/types.js";

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
    "Response Time",
    "Natural Language Report",
    "Encountered Error",
    "Additional Info",
  ];

  const rows = results.flatMap(
    ({ systemPrompt, iteration, metricResultsForModels }) =>
      metricResultsForModels.flatMap(({ model, metricResults }) =>
        metricResults.map(({ metric, result, responseTimeInSeconds }) => [
          iteration.toString(),
          escapeCSV(model),
          escapeCSV(systemPrompt),
          escapeCSV(metric.name),
          result.score.toString(),
          `${responseTimeInSeconds.toString()} seconds`,
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
    "Overall Score",
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

        return scores.length > 0
          ? scores.reduce((acc, score) => acc + score, 0) / scores.length
          : 0;
      });

      const metricAverageScores = metrics.map((metric) => {
        const scores = metricResultsForModels.flatMap(({ metricResults }) => {
          const result = metricResults.find(
            ({ metric: currentMetric }) => currentMetric.name === metric.name,
          );

          return result ? [result.result.score] : [];
        });

        return scores.length > 0
          ? scores.reduce((acc, score) => acc + score, 0) / scores.length
          : 0;
      });

      const allScores = [...modelAverageScores, ...metricAverageScores];
      const overallScore =
        allScores.reduce((acc, score) => acc + score, 0) / allScores.length;

      return [
        iteration.toString(),
        escapeCSV(systemPrompt),
        overallScore.toString(),
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

  const results = await Promise.all<MetricResultsForModel>(
    models.map(async (model) => {
      const metricResults = await Promise.all(
        metrics.map(async (metricDefinition) => {
          const startTime = new Date();

          const result = await metricDefinition.executeMetric({
            testingParams: {
              model,
              systemPrompt,
            },
          });

          const endTime = new Date();

          const responseTimeInSeconds =
            (endTime.getTime() - startTime.getTime()) / 1000;

          return {
            metric: metricDefinition,
            responseTimeInSeconds,
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
  let currentIteration = 1;

  if (!existsSync(directoryPath)) {
    mkdirSync(directoryPath, { recursive: true });
  }

  while (currentIteration <= numberOfIterations) {
    /**
     * Run the metrics for all models using the current system prompt.
     */
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

    currentIteration += 1;

    /**
     * If the current iteration is greater than the number of iterations, there
     * is no need to improve the system prompt further.
     */
    if (currentIteration > numberOfIterations) {
      break;
    }

    /**
     * Update the system prompt based on the results of the metrics.
     */
    const { updatedSystemPrompt } = await improveSystemPrompt({
      previousSystemPrompt: currentSystemPrompt,
      results,
    });

    currentSystemPrompt = updatedSystemPrompt;
  }
};
