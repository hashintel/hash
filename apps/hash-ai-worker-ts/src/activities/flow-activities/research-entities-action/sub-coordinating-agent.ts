import type { WorkerIdentifiers } from "@local/hash-isomorphic-utils/flows/types";
import { generateUuid } from "@local/hash-isomorphic-utils/generate-uuid";

import {
  getFlowContext,
  isActivityCancelled,
} from "../../shared/get-flow-context.js";
import type { ParsedLlmToolCall } from "../../shared/get-llm-response/types.js";
import { logProgress } from "../../shared/log-progress.js";
import { stringify } from "../../shared/stringify.js";
import type { LocalEntitySummary } from "../shared/infer-summaries-then-claims-from-text/get-entity-summaries-from-text.js";
import type { Claim } from "../shared/infer-summaries-then-claims-from-text/types.js";
import { linkFollowerAgent } from "./link-follower-agent.js";
import { areUrlsEqual } from "./shared/are-urls-equal.js";
import type {
  CompletedCoordinatorToolCall,
  CoordinatorToolCallArguments,
} from "./shared/coordinator-tools.js";
import { nullReturns } from "./shared/coordinator-tools.js";
import type { DuplicateReport } from "./shared/deduplicate-entities.js";
import { deduplicateEntities } from "./shared/deduplicate-entities.js";
import { handleWebSearchToolCall } from "./shared/handle-web-search-tool-call.js";
import { createInitialPlan } from "./sub-coordinating-agent/create-initial-plan.js";
import type { SubCoordinatingAgentInput } from "./sub-coordinating-agent/input.js";
import { requestSubCoordinatorActions } from "./sub-coordinating-agent/request-sub-coordinator-actions.js";
import type { SubCoordinatingAgentState } from "./sub-coordinating-agent/state.js";
import type {
  SubCoordinatingAgentToolName,
  SubCoordinatingAgentToolCallArguments,
} from "./sub-coordinating-agent/sub-coordinator-tools.js";

export const runSubCoordinatingAgent = async (params: {
  input: SubCoordinatingAgentInput;
  testingParams?: {
    persistState: (state: SubCoordinatingAgentState) => void;
    resumeFromState?: SubCoordinatingAgentState;
  };
  workerIdentifiers: WorkerIdentifiers;
}): Promise<
  | {
      status: "ok";
      explanation: string;
      discoveredEntities: LocalEntitySummary[];
      discoveredClaims: Claim[];
    }
  | {
      status: "terminated";
      explanation: string;
      discoveredEntities: LocalEntitySummary[];
      discoveredClaims: Claim[];
    }
> => {
  const { testingParams, input, workerIdentifiers } = params;

  const { stepId } = await getFlowContext();

  let state: SubCoordinatingAgentState;

  if (testingParams?.resumeFromState) {
    state = testingParams.resumeFromState;
  } else {
    const { initialPlan } = await createInitialPlan({ input });

    state = {
      plan: initialPlan,
      inferredClaims: [],
      entitySummaries: [],
      previousCalls: [],
      webQueriesMade: [],
      resourcesNotVisited: [],
      resourceUrlsVisited: [],
    };
  }

  const { toolCalls: initialToolCalls } = await requestSubCoordinatorActions({
    input,
    state,
  });

  const processToolCalls = async (processToolCallsParams: {
    toolCalls: ParsedLlmToolCall<SubCoordinatingAgentToolName>[];
  }): Promise<
    | {
        status: "ok";
        explanation: string;
      }
    | {
        status: "terminated";
        explanation: string;
      }
  > => {
    const { toolCalls } = processToolCallsParams;

    const terminateToolCall = toolCalls.find(
      (toolCall) => toolCall.name === "terminate",
    );

    if (terminateToolCall) {
      const { explanation } =
        terminateToolCall.input as SubCoordinatingAgentToolCallArguments["terminate"];

      return { status: "terminated", explanation };
    }

    const completedToolCalls = await Promise.all(
      toolCalls
        .filter(({ name }) => name !== "complete")
        .map(
          async (
            toolCall,
          ): Promise<
            CompletedCoordinatorToolCall<SubCoordinatingAgentToolName>
          > => {
            if (toolCall.name === "updatePlan") {
              const { plan } =
                toolCall.input as SubCoordinatingAgentToolCallArguments["updatePlan"];

              state.plan = plan;

              return {
                ...toolCall,
                ...nullReturns,
                output: `The plan has been successfully updated.`,
              };
            } else if (toolCall.name === "webSearch") {
              const webPageSummaries = await handleWebSearchToolCall({
                input:
                  toolCall.input as SubCoordinatingAgentToolCallArguments["webSearch"],
                workerIdentifiers,
              });

              if ("error" in webPageSummaries) {
                return {
                  ...toolCall,
                  ...nullReturns,
                  isError: true,
                  output: webPageSummaries.error,
                };
              }

              return {
                ...nullReturns,
                ...toolCall,
                output: "Search successful",
                webPagesFromSearchQuery: webPageSummaries,
              };
            } else if (toolCall.name === "inferClaimsFromResources") {
              const { resources } =
                toolCall.input as CoordinatorToolCallArguments["inferClaimsFromResources"];

              const responsesWithUrl = await Promise.all(
                resources.map(
                  async ({
                    url,
                    goal,
                    descriptionOfExpectedContent,
                    exampleOfExpectedContent,
                    reason,
                  }) => {
                    const linkFollowerInstanceId = generateUuid();

                    const linkFollowerIdentifiers: WorkerIdentifiers = {
                      workerType: "Link explorer",
                      parentInstanceId: workerIdentifiers.workerInstanceId,
                      workerInstanceId: linkFollowerInstanceId,
                    };

                    logProgress([
                      {
                        stepId,
                        recordedAt: new Date().toISOString(),
                        type: "StartedLinkExplorerTask",
                        input: {
                          goal,
                          initialUrl: url,
                        },
                        explanation: reason,
                        ...linkFollowerIdentifiers,
                      },
                    ]);

                    const response = await linkFollowerAgent({
                      workerIdentifiers: linkFollowerIdentifiers,
                      input: {
                        existingEntitiesOfInterest: input.relevantEntities,
                        initialResource: {
                          goal,
                          url,
                          descriptionOfExpectedContent,
                          exampleOfExpectedContent,
                          reason,
                        },
                        goal,
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
                          resourcesExploredCount:
                            response.exploredResources.length,
                          suggestionForNextSteps:
                            response.suggestionForNextSteps,
                        },
                        ...linkFollowerIdentifiers,
                      },
                    ]);

                    return { response, url };
                  },
                ),
              );

              const inferredClaims: Claim[] = [];
              const entitySummaries: LocalEntitySummary[] = [];
              const suggestionsForNextStepsMade: string[] = [];
              const resourceUrlsVisited: string[] = [];

              for (const { response } of responsesWithUrl) {
                inferredClaims.push(...response.inferredClaims);
                entitySummaries.push(...response.inferredSummaries);
                suggestionsForNextStepsMade.push(
                  response.suggestionForNextSteps,
                );
                resourceUrlsVisited.push(
                  ...response.exploredResources.map(({ url }) => url),
                );
              }

              return {
                ...toolCall,
                ...nullReturns,
                inferredClaims,
                entitySummaries,
                suggestionsForNextStepsMade,
                resourceUrlsVisited,
                output:
                  entitySummaries.length > 0
                    ? "Entities inferred from web page"
                    : "No claims were inferred about any relevant entities.",
              };
            }

            throw new Error(`Unexpected tool call: ${stringify(toolCall)}`);
          },
        ),
    );

    if (isActivityCancelled()) {
      return {
        status: "terminated",
        explanation: "Activity was cancelled",
      };
    }

    const completeToolCall = toolCalls.find(
      (toolCall) => toolCall.name === "complete",
    );

    state.previousCalls = [...state.previousCalls, { completedToolCalls }];

    const resourceUrlsVisited = completedToolCalls.flatMap(
      ({ resourceUrlsVisited: urlsVisited }) => urlsVisited ?? [],
    );

    state.resourceUrlsVisited = [
      ...new Set([...resourceUrlsVisited, ...state.resourceUrlsVisited]),
    ];

    const newWebPages = completedToolCalls
      .flatMap(({ webPagesFromSearchQuery }) => webPagesFromSearchQuery ?? [])
      .filter(
        (webPage) =>
          !state.resourcesNotVisited.find((page) => page.url === webPage.url) &&
          !state.resourceUrlsVisited.includes(webPage.url),
      );

    state.resourcesNotVisited.push(...newWebPages);

    state.resourcesNotVisited = state.resourcesNotVisited.filter(
      ({ url }) =>
        !state.resourceUrlsVisited.some((visitedUrl) =>
          areUrlsEqual(visitedUrl, url),
        ),
    );

    state.webQueriesMade.push(
      ...completedToolCalls.flatMap(
        ({ webQueriesMade }) => webQueriesMade ?? [],
      ),
    );

    const newEntitySummaries = completedToolCalls.flatMap(
      ({ entitySummaries }) => entitySummaries ?? [],
    );
    const newClaims = completedToolCalls.flatMap(
      ({ inferredClaims }) => inferredClaims ?? [],
    );

    state.inferredClaims = [...state.inferredClaims, ...newClaims];

    if (newEntitySummaries.length > 0) {
      const { duplicates } = await deduplicateEntities({
        entities: [
          ...input.relevantEntities,
          ...newEntitySummaries,
          ...state.entitySummaries,
        ],
      });

      const existingEntityIds = input.relevantEntities.map(
        ({ localId }) => localId,
      );

      const adjustedDuplicates = duplicates.map<DuplicateReport>(
        ({ canonicalId, duplicateIds }) => {
          if (existingEntityIds.includes(canonicalId)) {
            return { canonicalId, duplicateIds };
          }

          const existingEntityIdMarkedAsDuplicate = duplicateIds.find((id) =>
            existingEntityIds.includes(id),
          );

          /**
           * @todo: this doesn't account for when there are duplicates
           * detected in the input relevant entities.
           */
          if (existingEntityIdMarkedAsDuplicate) {
            return {
              canonicalId: existingEntityIdMarkedAsDuplicate,
              duplicateIds: [
                ...duplicateIds.filter(
                  (id) => id !== existingEntityIdMarkedAsDuplicate,
                ),
                canonicalId,
              ],
            };
          }

          return { canonicalId, duplicateIds };
        },
      );

      const inferredClaimsWithDeduplicatedEntities = state.inferredClaims.map(
        (claim) => {
          const { subjectEntityLocalId, objectEntityLocalId } = claim;
          const subjectDuplicate = adjustedDuplicates.find(({ duplicateIds }) =>
            duplicateIds.includes(subjectEntityLocalId),
          );

          const objectDuplicate = objectEntityLocalId
            ? duplicates.find(({ duplicateIds }) =>
                duplicateIds.includes(objectEntityLocalId),
              )
            : undefined;

          return {
            ...claim,
            subjectEntityLocalId:
              subjectDuplicate?.canonicalId ?? claim.subjectEntityLocalId,
            objectEntityLocalId:
              objectDuplicate?.canonicalId ?? objectEntityLocalId,
          };
        },
      );

      state.inferredClaims.push(...inferredClaimsWithDeduplicatedEntities);
      state.entitySummaries = [
        ...state.entitySummaries,
        ...newEntitySummaries,
      ].filter(
        ({ localId }) =>
          !duplicates.some(({ duplicateIds }) =>
            duplicateIds.includes(localId),
          ),
      );
    }

    if (testingParams?.persistState) {
      testingParams.persistState(state);
    }

    if (completeToolCall) {
      const { explanation } =
        completeToolCall.input as SubCoordinatingAgentToolCallArguments["complete"];

      return { status: "ok", explanation };
    }

    const { toolCalls: nextToolCalls } = await requestSubCoordinatorActions({
      input,
      state,
    });

    return processToolCalls({ toolCalls: nextToolCalls });
  };

  const result = await processToolCalls({ toolCalls: initialToolCalls });

  return {
    ...result,
    discoveredEntities: state.entitySummaries,
    discoveredClaims: state.inferredClaims,
  };
};
