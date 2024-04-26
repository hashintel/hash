import type { ProposedEntity } from "@local/hash-isomorphic-utils/flows/types";

import type { CompletedToolCall } from "../types";

const toolNames = [
  // "getWebPageInnerText",
  "getWebPageInnerHtml",
  // "getWebPageSummary",
  "inferEntitiesFromWebPage",
  "submitProposedEntities",
  "complete",
  "terminate",
  "updatePlan",
  "queryPdf",
] as const;

export type ToolName = (typeof toolNames)[number];

export const isToolName = (value: string): value is ToolName =>
  toolNames.includes(value as ToolName);

export type InferEntitiesFromWebPageWorkerAgentState = {
  currentPlan: string;
  previousCalls: {
    completedToolCalls: CompletedToolCall<ToolName>[];
  }[];
  proposedEntities: ProposedEntity[];
  submittedEntityIds: string[];
  inferredEntitiesFromWebPageUrls: string[];
  idCounter: number;
};
