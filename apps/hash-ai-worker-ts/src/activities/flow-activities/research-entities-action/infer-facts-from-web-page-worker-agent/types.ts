import type { VersionedUrl } from "@blockprotocol/type-system";

import type { DereferencedEntityType } from "../../../shared/dereference-entity-type";
import type { LocalEntitySummary } from "../../shared/infer-facts-from-text/get-entity-summaries-from-text";
import type { Fact } from "../../shared/infer-facts-from-text/types";
import type { CompletedToolCall } from "../types";

const toolNames = [
  "getWebPageInnerHtml",
  "inferFactsFromWebPage",
  "complete",
  "terminate",
  "updatePlan",
  "queryFactsFromPdf",
] as const;

export type ToolName = (typeof toolNames)[number];

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
  entitySummaries: LocalEntitySummary[];
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
