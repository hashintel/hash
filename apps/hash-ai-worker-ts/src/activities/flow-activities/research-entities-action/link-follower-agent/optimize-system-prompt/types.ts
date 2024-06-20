import type {
  LlmErrorResponse,
  LlmParams,
} from "../../../../shared/get-llm-response/types";

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
  maximumScore: number;
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
    metric: MetricDefinition;
    result: MetricResult;
  }[];
};
