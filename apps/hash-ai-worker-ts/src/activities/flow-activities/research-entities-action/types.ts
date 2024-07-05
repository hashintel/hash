import type { ParsedLlmToolCall } from "../../shared/get-llm-response/types";
import type { LocalEntitySummary } from "../shared/infer-facts-from-text/get-entity-summaries-from-text";
import type { Fact } from "../shared/infer-facts-from-text/types";

export type CompletedCoordinatorToolCall<ToolId extends string> = {
  inferredFacts: Fact[] | null;
  entitySummaries: LocalEntitySummary[] | null;
  subTasksCompleted?: string[] | null;
  suggestionsForNextStepsMade?: string[] | null;
  webPageUrlsVisited: string[] | null;
  webPagesFromSearchQuery: WebPageSummary[] | null;
  webQueriesMade: string[] | null;
  output: string;
  isError?: boolean;
} & ParsedLlmToolCall<ToolId>;

export type CompletedToolCall<ToolId extends string> = {
  output: string;
  isError?: boolean;
} & ParsedLlmToolCall<ToolId>;

export const nullReturns = {
  inferredFacts: null,
  entitySummaries: null,
  filesUsedToInferFacts: null,
  subTasksCompleted: null,
  suggestionsForNextStepsMade: null,
  webPageUrlsVisited: null,
  webPagesNotVisited: null,
  webPagesFromSearchQuery: null,
  webQueriesMade: null,
};

export type WebPageSummary = {
  url: string;
  summary: string;
};
