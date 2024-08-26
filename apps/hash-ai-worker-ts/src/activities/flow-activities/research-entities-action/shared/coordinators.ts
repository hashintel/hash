import type { Entity } from "@local/hash-graph-sdk/entity";
import type {
  ProposedEntity,
  WorkerIdentifiers,
} from "@local/hash-isomorphic-utils/flows/types";

import type { DereferencedEntityTypesByTypeId } from "../../../infer-entities/inference-types.js";
import type { DereferencedEntityType } from "../../../shared/dereference-entity-type.js";
import type { LlmParams } from "../../../shared/get-llm-response/types.js";
import type { LocalEntitySummary } from "../../shared/infer-summaries-then-claims-from-text/get-entity-summaries-from-text.js";
import type { Claim } from "../../shared/infer-summaries-then-claims-from-text/types.js";
import type { ExistingEntitySummary } from "../coordinating-agent/summarize-existing-entities.js";
import type {
  CompletedCoordinatorToolCall,
  CoordinatorToolName,
} from "./coordinator-tools.js";
import type { WebResourceSummary } from "./handle-web-search-tool-call.js";

export const coordinatingAgentModel: LlmParams["model"] = "gpt-4o-2024-08-06";

export type CoordinatingAgentInput = {
  allDereferencedEntityTypesById: DereferencedEntityTypesByTypeId;
  entityTypes: DereferencedEntityType<string>[];
  existingEntities?: Entity[];
  existingEntitySummaries?: ExistingEntitySummary[];
  humanInputCanBeRequested: boolean;
  linkEntityTypes?: DereferencedEntityType<string>[];
  prompt: string;
  reportSpecification?: string;
};

export type CoordinatingAgentState = {
  coordinatorIdentifiers: WorkerIdentifiers;
  delegatedTasksCompleted: string[];
  entitySummaries: LocalEntitySummary[];
  hasConductedCheckStep: boolean;
  inferredClaims: Claim[];
  plan: string;
  previousCalls: {
    completedToolCalls: CompletedCoordinatorToolCall<CoordinatorToolName>[];
  }[];
  proposedEntities: ProposedEntity[];
  questionsAndAnswers: string | null;
  resourceUrlsVisited: string[];
  resourcesNotVisited: WebResourceSummary[];
  submittedEntityIds: string[];
  suggestionsForNextStepsMade: string[];
  webQueriesMade: string[];
};
