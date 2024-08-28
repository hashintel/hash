import type { Entity } from "@local/hash-graph-sdk/entity";
import type {
  ProposedEntity,
  WorkerIdentifiers,
} from "@local/hash-isomorphic-utils/flows/types";
import { Context } from "@temporalio/activity";

import { stopWorkerSignal } from "../../../../shared/signals.js";
import type { DereferencedEntityTypesByTypeId } from "../../../infer-entities/inference-types.js";
import type { DereferencedEntityType } from "../../../shared/dereference-entity-type.js";
import { getTemporalClient } from "../../../shared/get-flow-context.js";
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

/**
 * The external input the coordinating agent receives, specifying the parameters of the research task.
 */
export type CoordinatingAgentInput = {
  /**
   * All entity types requested by the user as in scope for the research task.
   */
  allDereferencedEntityTypesById: DereferencedEntityTypesByTypeId;
  /**
   * Only the non-link entity types (a convenience to not have to split all types into link/non-link in multiple places)
   */
  entityTypes: DereferencedEntityType<string>[];
  /**
   * Only the link entity types (a convenience to not have to split all types into link/non-link in multiple places)
   */
  linkEntityTypes?: DereferencedEntityType<string>[];
  /**
   * Full details of entities that already exist, provided as inputs to the research task.
   */
  existingEntities?: Entity[];
  /**
   * Natural language summaries of any entities that already exist, for LLM consumption
   */
  existingEntitySummaries?: ExistingEntitySummary[];
  /**
   * Whether the coordinating agent can ask the user a question.
   */
  humanInputCanBeRequested: boolean;
  /**
   * The prompt for the research task, i.e. the user's description of what they want to achieve.
   */
  prompt: string;
  /**
   * If a report deliverable is requested as part of the research task, a description of what it should contain.
   */
  reportSpecification?: string;
};

/**
 * Tasks that the coordinating agent has started for which the results have not yet been processed.
 */
export type OutstandingCoordinatorTask<
  ToolCall extends ParsedCoordinatorToolCall | ParsedSubCoordinatorToolCall,
> = {
  /**
   * Whether the task may take a long time to complete.
   * Used to determine whether the task should be consistently waited for before returning to the coordinator for the
   * next step(s).
   *
   * e.g.
   * - a web search is NOT long-running, because it is a single API call
   * - deduplicating entities is NOT long-running, because it takes a limited time based on the number of entities to
   * deduplicate
   * - exploring a link is long-running, because the agent involved may continue to explore further links from the
   * original
   */
  longRunning: boolean;
  /**
   * The promise that, when fulfilled, will return the results of the task (which may be an output explaining why there
   * are no results).
   */
  resultsPromise: Promise<CompletedCoordinatorToolCall<CoordinatorToolName>>;
  /**
   * An object to store whether the promise has been fulfilled.
   * This is an object rather than a simple boolean to allow mutating its properties within the promise handlers.
   */
  status: {
    fulfilled: boolean;
  };
  /**
   * The LLM tool call that was made to start the task.
   */
  toolCall: ToolCall;
};

/**
 * The state of the coordinating agent, which is updated as the agent progresses through the research task.
 */
export type CoordinatingAgentState = {
  coordinatorIdentifiers: WorkerIdentifiers;
  /**
   * The goals of tasks which this agent has delegated to sub-coordinators.
   */
  delegatedTasksCompleted: string[];
  /**
   * The summaries of entities inferred so far.
   */
  entitySummaries: LocalEntitySummary[];
  /**
   * When the agent calls 'complete', whether checks have been made for anything to warn it about (e.g. missing
   * entities).
   *
   * If there are warnings, the agent is told about them and decides whether to proceed with completion anyway.
   */
  hasConductedCompleteCheckStep: boolean;
  /**
   * The claims about entities inferred so far
   */
  inferredClaims: Claim[];
  /**
   * The tasks that the agent has started but not yet received results from.
   *
   * If an agent decides to stop a task, it will be stopped at the earliest opportunity and its results still processed.
   */
  outstandingTasks: OutstandingCoordinatorTask<ParsedCoordinatorToolCall>[];
  /**
   * The agent's research plan
   */
  plan: string;
  /**
   * Previous completed tool calls made by the agent.
   */
  previousCalls: {
    completedToolCalls: CompletedCoordinatorToolCall<CoordinatorToolName>[];
  }[];
  /**
   * The full, schema-conforming properties of entities proposed so far.
   */
  proposedEntities: ProposedEntity[];
  /**
   * A string containing all the question and answer pairs asked of and responded to by the user.
   */
  questionsAndAnswers: string | null;
  /**
   * Which web resources have been visited by the agent or agents it spawns.
   */
  resourceUrlsVisited: string[];
  /**
   * Which URLs have not been visited, e.g. when returned from web searches
   */
  resourcesNotVisited: WebResourceSummary[];
  /**
   * The entityIds this coordinating agent has chosen as the relevant/highlighted entities for the user.
   */
  submittedEntityIds: string[];
  /**
   * Suggestions for next steps made by other agents which this agent has called.
   */
  suggestionsForNextStepsMade: string[];
  webQueriesMade: string[];
  /**
   * Any agents this coordinating agent has started, which by definition must have a parentInstanceId and toolCallId.
   */
  workersStarted: (WorkerIdentifiers & {
    parentInstanceId: string;
    toolCallId: string;
  })[];
};

export const stopWorkers = async (
  workersToStop: {
    explanation: string;
    toolCallId: string;
  }[],
) => {
  const temporalClient = await getTemporalClient();

  const { workflowId, runId } = Context.current().info.workflowExecution;

  const handle = temporalClient.workflow.getHandle(workflowId, runId);

  for (const { explanation, toolCallId } of workersToStop) {
    await handle.signal(stopWorkerSignal, {
      explanation,
      toolCallId,
    });
  }
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
