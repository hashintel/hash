import type { ParsedLlmToolCall } from "../../shared/get-llm-response/types";
import type { LocalEntitySummary } from "../shared/infer-facts-from-text/get-entity-summaries-from-text";
import type { Fact } from "../shared/infer-facts-from-text/types";
import type { AccessedRemoteFile } from "./infer-facts-from-web-page-worker-agent/types";

export type CompletedToolCall<ToolId extends string> = {
  inferredFacts: Fact[] | null;
  entitySummaries: LocalEntitySummary[] | null;
  filesUsedToInferFacts: AccessedRemoteFile[] | null;
  webPageUrlsVisited: string[] | null;
  webPagesFromSearchQuery: WebPageSummary[] | null;
  webQueriesMade: string[] | null;
  message: string;
  isError?: true;
} & ParsedLlmToolCall<ToolId>;

export const nullReturns = {
  inferredFacts: null,
  entitySummaries: null,
  filesUsedToInferFacts: null,
  webPageUrlsVisited: null,
  webPagesNotVisited: null,
  webQueriesMade: null,
};

export type WebPageSummary = {
  url: string;
  summary: string;
};
