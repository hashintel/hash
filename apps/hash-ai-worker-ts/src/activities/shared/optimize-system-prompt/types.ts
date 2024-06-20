import type { LlmErrorResponse, LlmParams } from "../get-llm-response/types";

export type MetricResult = {
  testingParams: {
    model: LlmParams["model"];
    systemPrompt: string;
  };
  score: number;
  naturalLanguageReport: string;
  additionalInfo?: Record<string, unknown>;
  encounteredError?: LlmErrorResponse;
};

export type MetricDefinition = {
  name: string;
  description: string;
  executeMetric: (params: {
    testingParams: {
      model: LlmParams["model"];
      systemPrompt: string;
    };
  }) => Promise<MetricResult>;
};

export type MetricResultsForModel = {
  model: LlmParams["model"];
  metricResults: {
    responseTimeInSeconds: number;
    metric: MetricDefinition;
    result: MetricResult;
  }[];
};

export type MetricResultsForSystemPrompt = {
  systemPrompt: string;
  iteration: number;
  metricResultsForModels: MetricResultsForModel[];
};
