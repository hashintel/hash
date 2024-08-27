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
import type { SubCoordinatingAgentState } from "../sub-coordinating-agent/state.js";
import type { ParsedSubCoordinatorToolCall } from "../sub-coordinating-agent/sub-coordinator-tools.js";
import { areUrlsEqual } from "./are-urls-equal.js";
import type {
  CompletedCoordinatorToolCall,
  CoordinatorToolName,
  ParsedCoordinatorToolCall,
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

export type OutstandingCoordinatorTask<
  ToolCall extends ParsedCoordinatorToolCall | ParsedSubCoordinatorToolCall,
> = {
  longRunning: boolean;
  resultsPromise: Promise<CompletedCoordinatorToolCall<CoordinatorToolName>>;
  status: {
    fulfilled: boolean;
  };
  toolCall: ToolCall;
};

export type CoordinatingAgentState = {
  coordinatorIdentifiers: WorkerIdentifiers;
  delegatedTasksCompleted: string[];
  entitySummaries: LocalEntitySummary[];
  hasConductedCheckStep: boolean;
  inferredClaims: Claim[];
  outstandingTasks: OutstandingCoordinatorTask<ParsedCoordinatorToolCall>[];
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

/**
 * Mutates agent state where coordinator-style agents do the same things to their state with certain tool call results.

 * @modifies {state}
 */
export const processCommonStateMutationsFromToolResults = ({
  toolCallResults,
  state,
}: {
  toolCallResults: CompletedCoordinatorToolCall<CoordinatorToolName>[];
  state: CoordinatingAgentState | SubCoordinatingAgentState;
}) => {
  const resourceUrlsVisited = toolCallResults.flatMap(
    ({ resourceUrlsVisited: urlsVisited }) => urlsVisited ?? [],
  );

  // eslint-disable-next-line no-param-reassign
  state.resourceUrlsVisited = [
    ...new Set([...resourceUrlsVisited, ...state.resourceUrlsVisited]),
  ];

  const newWebPages = toolCallResults
    .flatMap(({ webPagesFromSearchQuery }) => webPagesFromSearchQuery ?? [])
    .filter(
      (webPage) =>
        !state.resourcesNotVisited.find((page) => page.url === webPage.url) &&
        !state.resourceUrlsVisited.includes(webPage.url),
    );

  state.resourcesNotVisited.push(...newWebPages);

  // eslint-disable-next-line no-param-reassign
  state.resourcesNotVisited = state.resourcesNotVisited.filter(
    ({ url }) =>
      !state.resourceUrlsVisited.some((visitedUrl) =>
        areUrlsEqual(visitedUrl, url),
      ),
  );

  state.webQueriesMade.push(
    ...toolCallResults.flatMap(({ webQueriesMade }) => webQueriesMade ?? []),
  );
};
