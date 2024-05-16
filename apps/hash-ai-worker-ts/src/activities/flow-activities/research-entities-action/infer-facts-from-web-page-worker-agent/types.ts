import type { VersionedUrl } from "@blockprotocol/type-system";

import type { DereferencedEntityType } from "../../../shared/dereference-entity-type";
import type { EntitySummary } from "../../shared/infer-facts-from-text/get-entity-summaries-from-text";
import type { Fact } from "../../shared/infer-facts-from-text/types";
import type { CompletedToolCall } from "../types";

const toolNames = [
  // "getWebPageInnerText",
  "getWebPageInnerHtml",
  // "getWebPageSummary",
  "inferFactsFromWebPage",
  "complete",
  "terminate",
  "updatePlan",
  "queryPdf",
  "inferFactsFromText",
] as const;

export type ToolName = (typeof toolNames)[number];

export const isToolName = (value: string): value is ToolName =>
  toolNames.includes(value as ToolName);

export type AccessedRemoteFile = {
  /**
   * @todo: consider enforcing that this refers to a type that is or extends
   * the "File" system entity type
   *
   * @todo H-2728 add a name and description property inferred by the AI when looking at the file
   */
  entityTypeId: VersionedUrl;
  url: string;
  loadedAt: string;
};

export type InferFactsFromWebPageWorkerAgentState = {
  currentPlan: string;
  previousCalls: {
    completedToolCalls: CompletedToolCall<ToolName>[];
  }[];
  inferredFactsAboutEntities: EntitySummary[];
  inferredFacts: Fact[];
  inferredFactsFromWebPageUrls: string[];
  filesQueried: AccessedRemoteFile[];
  filesUsedToInferFacts: AccessedRemoteFile[];
};

export type InferFactsFromWebPageWorkerAgentInput = {
  prompt: string;
  entityTypes: DereferencedEntityType[];
  linkEntityTypes?: DereferencedEntityType[];
  url: string;
  innerHtml: string;
};
