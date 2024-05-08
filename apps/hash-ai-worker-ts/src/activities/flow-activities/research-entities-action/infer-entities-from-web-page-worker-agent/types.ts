import type { VersionedUrl } from "@blockprotocol/type-system";
import type { ProposedEntity } from "@local/hash-isomorphic-utils/flows/types";
import type { Entity } from "@local/hash-subgraph";

import type { DereferencedEntityType } from "../../../shared/dereference-entity-type";
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
  "inferEntitiesFromText",
] as const;

export type ToolName = (typeof toolNames)[number];

export const isToolName = (value: string): value is ToolName =>
  toolNames.includes(value as ToolName);

export type AccessedRemoteFile = {
  /**
   * @todo: consider enforcing that this refers to a type that is or extends
   * the "File" system entity type
   */
  entityTypeId: VersionedUrl;
  url: string;
  loadedAt: string;
};

export type InferEntitiesFromWebPageWorkerAgentState = {
  currentPlan: string;
  previousCalls: {
    completedToolCalls: CompletedToolCall<ToolName>[];
  }[];
  proposedEntities: ProposedEntity[];
  submittedEntityIds: string[];
  inferredEntitiesFromWebPageUrls: string[];
  idCounter: number;
  filesQueried: AccessedRemoteFile[];
  filesUsedToProposeEntities: AccessedRemoteFile[];
};

export type InferEntitiesFromWebPageWorkerAgentInput = {
  prompt: string;
  entityTypes: DereferencedEntityType[];
  linkEntityTypes?: DereferencedEntityType[];
  existingEntities?: Entity[];
  url: string;
  innerHtml: string;
};
