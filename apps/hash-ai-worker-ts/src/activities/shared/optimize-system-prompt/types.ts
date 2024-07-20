import type { LlmErrorResponse, LlmParams } from "../get-llm-response/types.js";

export interface MetricResult {
  testingParams: {
    model: LlmParams["model"];
    systemPrompt: string;
  };
  score: number;
  naturalLanguageReport: string;
  additionalInfo?: Record<string, unknown>;
  encounteredError?: LlmErrorResponse;
}

export interface MetricDefinition {
  name: string;
  description: string;
  executeMetric: (params: {
    testingParams: {
      model: LlmParams["model"];
      systemPrompt: string;
    };
  }) => Promise<MetricResult>;
}

export interface MetricResultsForModel {
  model: LlmParams["model"];
  metricResults: {
    responseTimeInSeconds: number;
    metric: MetricDefinition;
    result: MetricResult;
  }[];
}

export interface MetricResultsForSystemPrompt {
  systemPrompt: string;
  iteration: number;
  metricResultsForModels: MetricResultsForModel[];
}
