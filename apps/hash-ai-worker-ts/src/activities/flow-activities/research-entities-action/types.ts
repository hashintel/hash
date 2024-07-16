import type { ParsedLlmToolCall } from "../../shared/get-llm-response/types.js";
import type { LocalEntitySummary } from "../shared/infer-facts-from-text/get-entity-summaries-from-text.js";
import type { Fact } from "../shared/infer-facts-from-text/types.js";

export type CompletedCoordinatorToolCall<ToolId extends string> = {
  inferredFacts: Fact[] | null;
  entitySummaries: LocalEntitySummary[] | null;
  subTasksCompleted?: string[] | null;
  suggestionsForNextStepsMade?: string[] | null;
  resourceUrlsVisited: string[] | null;
  webPagesFromSearchQuery: ResourceSummary[] | null;
  webQueriesMade: string[] | null;
  output: string;
  isError?: boolean;
} & ParsedLlmToolCall<ToolId>;

export type CompletedToolCall<ToolId extends string> = {
  output: string;
  isError?: boolean;
} & ParsedLlmToolCall<ToolId>;

export const nullReturns: Omit<
  CompletedCoordinatorToolCall<string>,
  "output" | "isError" | keyof ParsedLlmToolCall
> = {
  inferredFacts: null,
  entitySummaries: null,
  subTasksCompleted: null,
  suggestionsForNextStepsMade: null,
  resourceUrlsVisited: null,
  webPagesFromSearchQuery: null,
  webQueriesMade: null,
};

export type ResourceSummary = {
  url: string;
  title: string;
  summary: string;
};
