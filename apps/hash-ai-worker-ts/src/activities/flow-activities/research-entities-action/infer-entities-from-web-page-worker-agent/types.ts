import type { CompletedToolCall, ProposedEntityWithLocalId } from "../types";

const toolIds = [
  // "getWebPageInnerText",
  "getWebPageInnerHtml",
  // "getWebPageSummary",
  "inferEntitiesFromWebPage",
  "submitProposedEntities",
  "complete",
  "terminate",
  "updatePlan",
] as const;

export type ToolId = (typeof toolIds)[number];

export const isToolId = (value: string): value is ToolId =>
  toolIds.includes(value as ToolId);

export type InferEntitiesFromWebPageWorkerAgentState = {
  currentPlan: string;
  previousCalls: {
    completedToolCalls: CompletedToolCall<ToolId>[];
  }[];
  proposedEntities: ProposedEntityWithLocalId[];
  submittedEntityIds: string[];
  inferredEntitiesFromWebPageUrls: string[];
  idCounter: number;
};
