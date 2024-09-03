import type { WorkerIdentifiers } from "@local/hash-isomorphic-utils/flows/types";
import { generateUuid } from "@local/hash-isomorphic-utils/generate-uuid";

import { logger } from "../../../../shared/activity-logger.js";
import { getFlowContext } from "../../../../shared/get-flow-context.js";
import { logProgress } from "../../../../shared/log-progress.js";
import { stringify } from "../../../../shared/stringify.js";
import { getAnswersFromHuman } from "../../get-answers-from-human.js";
import { linkFollowerAgent } from "../../link-follower-agent.js";
import { runSubCoordinatingAgent } from "../../sub-coordinating-agent.js";
import type { SubCoordinatingAgentInput } from "../../sub-coordinating-agent/input.js";
import type { SubCoordinatingAgentState } from "../../sub-coordinating-agent/state.js";
import type {
  CompletedCoordinatorToolCall,
  CoordinatorToolName,
  ParsedCoordinatorToolCall,
  ParsedCoordinatorToolCallMap,
  ParsedSubCoordinatorToolCall,
  ParsedSubCoordinatorToolCallMap,
  SubCoordinatingAgentToolName,
} from "../coordinator-tools.js";
import { nullReturns } from "../coordinator-tools.js";
import type {
  CoordinatingAgentInput,
  CoordinatingAgentState,
} from "../coordinators.js";
import { handleWebSearchToolCall } from "../handle-web-search-tool-call.js";

export type GetCoordinatorToolCallResultsParams = {
  agentType: "coordinator";
  input: CoordinatingAgentInput;
  state: CoordinatingAgentState;
  toolCall: Exclude<
    ParsedCoordinatorToolCall,
    | ParsedCoordinatorToolCallMap["complete"]
    | ParsedCoordinatorToolCallMap["stopTasks"]
    | ParsedCoordinatorToolCallMap["terminate"]
    | ParsedCoordinatorToolCallMap["waitForOutstandingTasks"]
  >;
  workerIdentifiers: WorkerIdentifiers;
};

export type GetSubCoordinatorToolCallResultsParams = {
  agentType: "sub-coordinator";
  input: SubCoordinatingAgentInput;
  toolCall: Exclude<
    ParsedSubCoordinatorToolCall,
    | ParsedSubCoordinatorToolCallMap["complete"]
    | ParsedSubCoordinatorToolCallMap["stopTasks"]
    | ParsedSubCoordinatorToolCallMap["terminate"]
    | ParsedSubCoordinatorToolCallMap["waitForOutstandingTasks"]
  >;
  state: SubCoordinatingAgentState;
  workerIdentifiers: WorkerIdentifiers;
};

export function getToolCallResults(
  params: GetCoordinatorToolCallResultsParams,
): Promise<CompletedCoordinatorToolCall<CoordinatorToolName>>;

export function getToolCallResults(
  params: GetSubCoordinatorToolCallResultsParams,
): Promise<CompletedCoordinatorToolCall<SubCoordinatingAgentToolName>>;

/**
 * Get the results of a coordinator tool call.
 *
 * The return shape of tool calls is unified across tool calls because there is overlap between what they return,
 * and it's simpler to merge the results when no checks for the return shape are required.
 *
 * This does mean that each tool call has to explicitly specify which of the properties it is populating,
 * and pass the nullReturns object to fill in the rest, which is less safe than defining different return objects,
 * so it may be worth investing the effort in a more complicated merging of results at some point.
 */
export async function getToolCallResults(
  params:
    | GetCoordinatorToolCallResultsParams
    | GetSubCoordinatorToolCallResultsParams,
): Promise<
  CompletedCoordinatorToolCall<
    CoordinatorToolName | SubCoordinatingAgentToolName
  >
> {
  const { stepId } = await getFlowContext();

  const { agentType, input, state, toolCall, workerIdentifiers } = params;

  if (toolCall.name === "updatePlan") {
    const { plan } = toolCall.input;

    /**
     * An 'updated plan' progress log is currently not handled here as we do not show the log for sub-coordinators.
     * We could move the progress log here when we do so.
     */

    return {
      ...nullReturns,
      ...toolCall,
      updatedPlan: plan,
      output: `The plan has been successfully updated.`,
    };
  } else if (toolCall.name === "requestHumanInput") {
    if (agentType === "sub-coordinator") {
      throw new Error(
        "Sub-coordinators cannot use the requestHumanInput tool.",
      );
    }

    const { questions } = toolCall.input;

    if (questions.length === 0) {
      return {
        ...toolCall,
        ...nullReturns,
        output: "No questions were provided.",
        isError: true,
      };
    }

    logger.debug(
      `Requesting human input for questions: ${stringify(questions)}`,
    );

    const response = await getAnswersFromHuman(toolCall.input.questions);

    // eslint-disable-next-line no-param-reassign
    params.state.questionsAndAnswers =
      (params.state.questionsAndAnswers ?? "") + response;

    return {
      ...nullReturns,
      ...toolCall,
      output: response,
    };
  } else if (toolCall.name === "webSearch") {
    const webPageSummaries = await handleWebSearchToolCall({
      input: toolCall.input,
      workerIdentifiers,
    });

    if ("error" in webPageSummaries) {
      return {
        ...toolCall,
        ...nullReturns,
        webQueriesMade: [toolCall.input.query],
        isError: true,
        output: webPageSummaries.error,
      };
    }

    return {
      ...nullReturns,
      ...toolCall,
      output: "Search successful",
      webQueriesMade: [toolCall.input.query],
      webPagesFromSearchQuery: webPageSummaries,
    };
  } else if (toolCall.name === "inferClaimsFromResource") {
    const {
      url,
      goal,
      relevantEntityIds,
      descriptionOfExpectedContent,
      exampleOfExpectedContent,
      explanation,
    } = toolCall.input;

    const relevantEntities = state.entitySummaries.filter(({ localId }) =>
      relevantEntityIds.includes(localId),
    );

    const linkExplorerIdentifiers = {
      workerType: "Link explorer",
      workerInstanceId: generateUuid(),
      parentInstanceId: workerIdentifiers.workerInstanceId,
      toolCallId: toolCall.id,
    } satisfies WorkerIdentifiers;

    logProgress([
      {
        stepId,
        recordedAt: new Date().toISOString(),
        type: "StartedLinkExplorerTask",
        input: {
          goal,
          initialUrl: url,
        },
        explanation,
        ...linkExplorerIdentifiers,
      },
    ]);

    state.workersStarted.push(linkExplorerIdentifiers);

    const response = await linkFollowerAgent({
      workerIdentifiers: linkExplorerIdentifiers,
      input: {
        initialResource: {
          goal,
          url,
          descriptionOfExpectedContent,
          exampleOfExpectedContent,
          reason: explanation,
        },
        goal,
        existingEntitiesOfInterest: relevantEntities,
        entityTypes: input.entityTypes,
      },
    });

    logProgress([
      {
        stepId,
        recordedAt: new Date().toISOString(),
        type: "ClosedLinkExplorerTask",
        goal,
        output: {
          claimCount: response.inferredClaims.length,
          entityCount: response.inferredSummaries.length,
          resourcesExploredCount: response.exploredResources.length,
          suggestionForNextSteps: response.suggestionForNextSteps,
        },
        ...linkExplorerIdentifiers,
      },
    ]);

    return {
      ...toolCall,
      ...nullReturns,
      inferredClaims: response.inferredClaims,
      entitySummaries: response.inferredSummaries,
      suggestionsForNextStepsMade: [response.suggestionForNextSteps],
      resourceUrlsVisited: response.exploredResources.map(
        (resource) => resource.url,
      ),
      isError: response.status === "error",
      output:
        response.status === "error"
          ? response.message
          : response.inferredSummaries.length > 0
            ? "Entities inferred from web page"
            : "No claims were inferred about any relevant entities.",
    };
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- safeguard to ensure all cases are handled
  } else if (toolCall.name === "delegateResearchTask") {
    if (agentType === "sub-coordinator") {
      throw new Error("Sub-coordinator cannot use delegateResearchTask tool");
    }

    const { goal, relevantEntityIds, explanation } = toolCall.input;

    const relevantEntities = state.entitySummaries.filter(({ localId }) =>
      relevantEntityIds.includes(localId),
    );

    const existingClaimsAboutRelevantEntities = state.inferredClaims.filter(
      ({ subjectEntityLocalId }) =>
        relevantEntityIds.includes(subjectEntityLocalId),
    );

    const delegatedTaskIdentifiers = {
      workerType: "Sub-coordinator",
      workerInstanceId: generateUuid(),
      parentInstanceId: workerIdentifiers.workerInstanceId,
      toolCallId: toolCall.id,
    } satisfies WorkerIdentifiers;

    logProgress([
      {
        type: "StartedSubCoordinator",
        explanation,
        input: {
          goal,
          entityTypeTitles: input.entityTypes.map((type) => type.title),
        },
        recordedAt: new Date().toISOString(),
        stepId,
        ...delegatedTaskIdentifiers,
      },
    ]);

    state.workersStarted.push(delegatedTaskIdentifiers);

    const response = await runSubCoordinatingAgent({
      input: {
        goal,
        relevantEntities,
        existingClaimsAboutRelevantEntities,
        entityTypes: input.entityTypes,
      },
      workerIdentifiers: delegatedTaskIdentifiers,
    });

    logProgress([
      {
        type: "ClosedSubCoordinator",
        errorMessage:
          response.status !== "ok" ? response.explanation : undefined,
        explanation:
          response.status === "ok"
            ? response.explanation
            : response.explanation,
        goal,
        output:
          response.status === "ok"
            ? {
                claimCount: response.discoveredClaims.length,
                entityCount: response.discoveredEntities.length,
              }
            : { claimCount: 0, entityCount: 0 },
        recordedAt: new Date().toISOString(),
        stepId,
        ...delegatedTaskIdentifiers,
      },
    ]);

    const errorMessage =
      response.status === "ok"
        ? null
        : `An error occurred in the delegated task: ${response.explanation}`;

    return {
      ...toolCall,
      ...nullReturns,
      inferredClaims: response.discoveredClaims,
      entitySummaries: response.discoveredEntities,
      delegatedTasksCompleted: [goal],
      output: errorMessage ?? "Delegated tasks completed.",
      isError: !!errorMessage,
    };
  }

  // @ts-expect-error –– safeguard to ensure all cases are handled
  throw new Error(`Unimplemented tool call: ${toolCall.name}`);
}
