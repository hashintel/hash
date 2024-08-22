import type { OriginProvenance } from "@local/hash-graph-client";
import { SourceType } from "@local/hash-graph-client";
import { flattenPropertyMetadata } from "@local/hash-graph-sdk/entity";
import type { EntityId, EntityUuid } from "@local/hash-graph-types/entity";
import type { OutputNameForAction } from "@local/hash-isomorphic-utils/flows/action-definitions";
import type {
  ProposedEntity,
  WorkerIdentifiers,
} from "@local/hash-isomorphic-utils/flows/types";
import { generateUuid } from "@local/hash-isomorphic-utils/generate-uuid";
import {
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
} from "@local/hash-isomorphic-utils/graph-queries";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import type { FileProperties } from "@local/hash-isomorphic-utils/system-types/shared";
import { isNotNullish } from "@local/hash-isomorphic-utils/types";
import { entityIdFromComponents } from "@local/hash-subgraph";
import { StatusCode } from "@local/status";
import { Context } from "@temporalio/activity";
import dedent from "dedent";

import { logger } from "../shared/activity-logger.js";
import {
  areUrlsTheSameAfterNormalization,
  getFlowContext,
  getProvidedFiles,
} from "../shared/get-flow-context.js";
import type { ParsedLlmToolCall } from "../shared/get-llm-response/types.js";
import { graphApiClient } from "../shared/graph-api-client.js";
import { logProgress } from "../shared/log-progress.js";
import { stringify } from "../shared/stringify.js";
import { checkSubTasksAgent } from "./research-entities-action/check-sub-tasks-agent.js";
import {
  createCheckpoint,
  getCheckpoint,
  heartbeatAndWaitCancellation,
} from "./research-entities-action/checkpoints.js";
import type {
  CoordinatingAgentInput,
  CoordinatingAgentState,
} from "./research-entities-action/coordinating-agent.js";
import { coordinatingAgent } from "./research-entities-action/coordinating-agent.js";
import type {
  CoordinatorToolCallArguments,
  CoordinatorToolName,
} from "./research-entities-action/coordinator-tools.js";
import type { DuplicateReport } from "./research-entities-action/deduplicate-entities.js";
import { deduplicateEntities } from "./research-entities-action/deduplicate-entities.js";
import { getAnswersFromHuman } from "./research-entities-action/get-answers-from-human.js";
import { handleWebSearchToolCall } from "./research-entities-action/handle-web-search-tool-call.js";
import { linkFollowerAgent } from "./research-entities-action/link-follower-agent.js";
import { runSubTaskAgent } from "./research-entities-action/sub-task-agent.js";
import type { CompletedCoordinatorToolCall } from "./research-entities-action/types.js";
import { nullReturns } from "./research-entities-action/types.js";
import type { LocalEntitySummary } from "./shared/infer-summaries-then-claims-from-text/get-entity-summaries-from-text.js";
import type { Claim } from "./shared/infer-summaries-then-claims-from-text/types.js";
import { proposeEntitiesFromClaims } from "./shared/propose-entities-from-claims.js";
import type { FlowActionActivity } from "./types.js";

const adjustDuplicates = (params: {
  duplicates: DuplicateReport[];
  entityIdsWhichCannotBeDeduplicated: EntityId[];
}) => {
  const { duplicates, entityIdsWhichCannotBeDeduplicated } = params;

  const adjustedDuplicates = duplicates.map<DuplicateReport>(
    ({ canonicalId, duplicateIds }) => {
      if (entityIdsWhichCannotBeDeduplicated.includes(canonicalId)) {
        return { canonicalId, duplicateIds };
      }

      const existingEntityIdMarkedAsDuplicate = duplicateIds.find((id) =>
        entityIdsWhichCannotBeDeduplicated.includes(id),
      );

      /**
       * @todo: this doesn't account for when there are duplicates
       * detected in the existing entities.
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

  return adjustedDuplicates;
};

/**
 * Given newly discovered claims and entity summaries:
 * 1. Deduplicate entities
 * 2. Update the state with the new claims and entity summaries
 * 3. Create or update proposals for (1) new entities and (2) existing entities with new claims
 * 4. Update the state with the new and updated proposals
 */
const updateStateFromInferredClaims = async (params: {
  input: CoordinatingAgentInput;
  state: CoordinatingAgentState;
  newClaims: Claim[];
  newEntitySummaries: LocalEntitySummary[];
  workerIdentifiers: WorkerIdentifiers;
}) => {
  const { input, state, newEntitySummaries, newClaims, workerIdentifiers } =
    params;

  /**
   * Step 1: Deduplication (if necessary)
   */

  const canonicalEntityIdsForNewDuplicates: string[] = [];
  if (newEntitySummaries.length === 0) {
    // do nothing – there are no new entities to deduplicate
  } else {
    /**
     * We need to deduplicate newly discovered entities (which may contain duplicates within them)
     * alongside any existing entities.
     */
    const { duplicates } = await deduplicateEntities({
      entities: [
        ...(input.existingEntitySummaries ?? []),
        ...newEntitySummaries,
        ...state.entitySummaries,
      ],
    });

    /**
     * There are some entities that shouldn't be marked as the duplicates, and
     * should instead always be the canonical entity.
     */
    const entityIdsWhichCannotBeDeduplicated = [
      /**
       * We don't want to deduplicate any entities that are already persisted in
       * the graph (i.e. the `existingEntities` passed in as input to the action)
       */
      ...(input.existingEntitySummaries ?? []).map(({ entityId }) => entityId),
    ];

    const adjustedDuplicates = adjustDuplicates({
      duplicates,
      entityIdsWhichCannotBeDeduplicated,
    });

    canonicalEntityIdsForNewDuplicates.push(
      ...adjustedDuplicates.map(({ canonicalId }) => canonicalId),
    );

    const inferredClaimsWithDeduplicatedEntities = newClaims.map((claim) => {
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
    });

    state.inferredClaims.push(...inferredClaimsWithDeduplicatedEntities);
    state.entitySummaries = [
      ...state.entitySummaries,
      ...newEntitySummaries,
    ].filter(
      ({ localId }) =>
        !duplicates.some(({ duplicateIds }) => duplicateIds.includes(localId)),
    );

    /**
     * Account for any previously proposed entities with a local ID which has
     * been marked as a duplicate.
     */
    state.proposedEntities = state.proposedEntities
      .map((proposedEntity) => {
        const duplicate = duplicates.find(({ duplicateIds }) =>
          duplicateIds.includes(proposedEntity.localEntityId),
        );

        return duplicate ? null : proposedEntity;
      })
      .filter(isNotNullish);
  }

  /**
   * Step 2: Create or update proposals for new entities and existing entities with new claims
   */

  /**
   * We want to (re)propose entities which may have new information, via one of:
   * 1. Appearing as a new summary
   * 2. Being the subject or object of a new claim
   * 3. Having been identified as the canonical version of a new duplicate (which means it may have had new claims
   * discovered)
   */
  const entityIdsToPropose = [
    ...new Set([
      ...newEntitySummaries.map(({ localId }) => localId),
      ...newClaims.flatMap(({ subjectEntityLocalId, objectEntityLocalId }) =>
        [subjectEntityLocalId, objectEntityLocalId].filter(isNotNullish),
      ),
      ...canonicalEntityIdsForNewDuplicates,
    ]),
  ];

  /**
   * Gather the claims which relate to the entities that are being proposed
   */
  const entitySummaries = state.entitySummaries.filter(({ localId }) =>
    entityIdsToPropose.includes(localId),
  );

  const relevantClaims = state.inferredClaims.filter(
    ({ subjectEntityLocalId, objectEntityLocalId }) =>
      entityIdsToPropose.includes(subjectEntityLocalId) ||
      /**
       * Claims where the entity is the object may contain information which is useful in constructing it,
       * or a link from it – the claim may be expressed in the reverse direction to that of the target entity types.
       */
      (objectEntityLocalId && entityIdsToPropose.includes(objectEntityLocalId)),
  );

  /**
   * Given the affected entities, we also need the summaries of entities they may link to.
   */
  const potentialLinkTargetEntitySummaries = state.entitySummaries.filter(
    ({ localId }) =>
      relevantClaims.some(
        ({ objectEntityLocalId }) => localId === objectEntityLocalId,
      ),
  );

  /**
   * Get the updated proposals
   */
  const { proposedEntities: newProposedEntities } =
    await proposeEntitiesFromClaims({
      dereferencedEntityTypes: input.allDereferencedEntityTypesById,
      entitySummaries,
      existingEntitySummaries: input.existingEntitySummaries,
      claims: relevantClaims,
      potentialLinkTargetEntitySummaries,
      workerIdentifiers,
    });

  state.proposedEntities = [
    /**
     * Filter out any previous proposed entities that have been re-proposed with new claims.
     */
    ...state.proposedEntities.filter(
      ({ localEntityId }) =>
        !newProposedEntities.some(
          (newProposedEntity) =>
            newProposedEntity.localEntityId === localEntityId,
        ),
    ),
    ...newProposedEntities,
  ];
};

/**
 * This is the function that takes starting coordinating agent state and has the coordinator orchestrate the research task.
 */
const execResearchEntitiesAction: FlowActionActivity<{
  state: CoordinatingAgentState;
  testingParams?: {
    humanInputCanBeRequested?: boolean;
    persistState?: (state: CoordinatingAgentState) => void;
    resumeFromState?: CoordinatingAgentState;
  };
}> = async ({ inputs: stepInputs, state, testingParams }) => {
  const workerIdentifiers = state.coordinatorIdentifiers;

  const input = await coordinatingAgent.parseCoordinatorInputs({
    stepInputs,
    testingParams,
  });

  const { flowEntityId, stepId, webId } = await getFlowContext();

  const providedFileEntities = await getProvidedFiles();

  const providedFiles: CoordinatingAgentState["resourcesNotVisited"] =
    providedFileEntities.map((entity) => {
      const {
        fileUrl: unsignedUrl,
        description,
        displayName,
        fileName,
      } = simplifyProperties(entity.properties);

      return {
        url: unsignedUrl,
        title: displayName ?? fileName ?? unsignedUrl.split("/").pop()!,
        summary: description ?? "",
        fromSearchQuery: "User-provided resource",
      };
    });

  if (!state.plan) {
    /**
     * If we don't already have a plan, this is the first run of the action
     */
    logProgress([
      {
        type: "StartedCoordinator",
        attempt: Context.current().info.attempt,
        input: {
          goal: input.prompt,
        },
        recordedAt: new Date().toISOString(),
        stepId,
        ...workerIdentifiers,
      },
    ]);

    /**
     * We start by asking the coordinator agent to create an initial plan
     * for the research task.
     */
    const { plan: initialPlan, questionsAndAnswers } =
      await coordinatingAgent.createInitialPlan({
        input,
        providedFiles,
        questionsAndAnswers: null,
      });

    logProgress([
      {
        recordedAt: new Date().toISOString(),
        stepId: Context.current().info.activityId,
        type: "CreatedPlan",
        plan: initialPlan,
        ...workerIdentifiers,
      },
    ]);

    /* eslint-disable no-param-reassign */
    state.plan = initialPlan;
    state.questionsAndAnswers = questionsAndAnswers;
    /* eslint-enable no-param-reassign */

    if (testingParams?.persistState) {
      testingParams.persistState(state);
    }

    await createCheckpoint({ state });
  }

  const { toolCalls: initialToolCalls } =
    await coordinatingAgent.getNextToolCalls({
      input,
      state,
    });

  const getSubmittedEntities = () =>
    state.proposedEntities.filter(({ localEntityId }) =>
      state.submittedEntityIds.includes(localEntityId),
    );

  const processToolCalls = async (params: {
    toolCalls: ParsedLlmToolCall<CoordinatorToolName>[];
  }) => {
    const { toolCalls } = params;

    const isTerminated = toolCalls.some(
      (toolCall) => toolCall.name === "terminate",
    );

    if (isTerminated) {
      return;
    }

    const toolCallsWithRelevantResults = toolCalls.filter(
      ({ name }) => name !== "terminate",
    );

    const completedToolCalls = await Promise.all(
      toolCallsWithRelevantResults.map(
        async (
          toolCall,
        ): Promise<CompletedCoordinatorToolCall<CoordinatorToolName>> => {
          if (toolCall.name === "updatePlan") {
            const { plan } =
              toolCall.input as CoordinatorToolCallArguments["updatePlan"];

            // eslint-disable-next-line no-param-reassign
            state.plan = plan;

            logProgress([
              {
                type: "UpdatedPlan",
                plan,
                stepId,
                recordedAt: new Date().toISOString(),
                ...workerIdentifiers,
              },
            ]);

            return {
              ...nullReturns,
              ...toolCall,
              output: `The plan has been successfully updated.`,
            };
          } else if (toolCall.name === "requestHumanInput") {
            const { questions } =
              toolCall.input as CoordinatorToolCallArguments["requestHumanInput"];

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

            const response = await getAnswersFromHuman(
              (
                toolCall.input as CoordinatorToolCallArguments["requestHumanInput"]
              ).questions,
            );

            // eslint-disable-next-line no-param-reassign
            state.questionsAndAnswers =
              (state.questionsAndAnswers ?? "") + response;

            return {
              ...nullReturns,
              ...toolCall,
              output: response,
            };
          } else if (toolCall.name === "webSearch") {
            const webPageSummaries = await handleWebSearchToolCall({
              input:
                toolCall.input as CoordinatorToolCallArguments["webSearch"],
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
                  relevantEntityIds,
                  descriptionOfExpectedContent,
                  exampleOfExpectedContent,
                  reason,
                }) => {
                  const relevantEntities = state.entitySummaries.filter(
                    ({ localId }) => relevantEntityIds?.includes(localId),
                  );

                  const linkExplorerIdentifiers: WorkerIdentifiers = {
                    workerType: "Link explorer",
                    workerInstanceId: generateUuid(),
                    parentInstanceId: workerIdentifiers.workerInstanceId,
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
                      ...linkExplorerIdentifiers,
                    },
                  ]);

                  const response = await linkFollowerAgent({
                    workerIdentifiers: linkExplorerIdentifiers,
                    input: {
                      initialResource: {
                        goal,
                        url,
                        descriptionOfExpectedContent,
                        exampleOfExpectedContent,
                        reason,
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
                        resourcesExploredCount:
                          response.exploredResources.length,
                        suggestionForNextSteps: response.suggestionForNextSteps,
                      },
                      ...linkExplorerIdentifiers,
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
              suggestionsForNextStepsMade.push(response.suggestionForNextSteps);
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
          } else if (toolCall.name === "startClaimGatheringSubTasks") {
            const { subTasks } =
              toolCall.input as CoordinatorToolCallArguments["startClaimGatheringSubTasks"];

            let counter = 0;

            const subTasksWithIds = subTasks.map((subTask) => ({
              ...subTask,
              subTaskId: `${counter++}`,
            }));

            const { acceptedSubTasks, rejectedSubTasks } =
              await checkSubTasksAgent({
                input,
                state,
                subTasks: subTasksWithIds,
              });

            const responsesWithSubTask = await Promise.all(
              subTasksWithIds
                .filter((subTask) =>
                  acceptedSubTasks.some(
                    ({ subTaskId }) => subTaskId === subTask.subTaskId,
                  ),
                )
                .map(async (subTask) => {
                  const { goal, relevantEntityIds, explanation } = subTask;

                  const relevantEntities = state.entitySummaries.filter(
                    ({ localId }) => relevantEntityIds?.includes(localId),
                  );

                  const existingClaimsAboutRelevantEntities =
                    state.inferredClaims.filter(({ subjectEntityLocalId }) =>
                      relevantEntityIds?.includes(subjectEntityLocalId),
                    );

                  const subTaskIdentifiers: WorkerIdentifiers = {
                    workerType: "Subtask",
                    workerInstanceId: generateUuid(),
                    parentInstanceId: workerIdentifiers.workerInstanceId,
                  };

                  logProgress([
                    {
                      type: "StartedSubTask",
                      explanation,
                      input: {
                        goal,
                        entityTypeTitles: input.entityTypes.map(
                          (type) => type.title,
                        ),
                      },
                      recordedAt: new Date().toISOString(),
                      stepId,
                      ...subTaskIdentifiers,
                    },
                  ]);

                  const response = await runSubTaskAgent({
                    input: {
                      goal,
                      relevantEntities,
                      existingClaimsAboutRelevantEntities,
                      entityTypes: input.entityTypes,
                    },
                    workerIdentifiers: subTaskIdentifiers,
                  });

                  logProgress([
                    {
                      type: "ClosedSubTask",
                      errorMessage:
                        response.status !== "ok" ? response.reason : undefined,
                      explanation:
                        response.status === "ok"
                          ? response.explanation
                          : response.reason,
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
                      ...subTaskIdentifiers,
                    },
                  ]);

                  return { response, subTask };
                }),
            );

            const inferredClaims: Claim[] = [];
            const entitySummaries: LocalEntitySummary[] = [];
            const subTasksCompleted: string[] = [];

            let errorMessage: string = "";

            for (const { response, subTask } of responsesWithSubTask) {
              entitySummaries.push(...response.discoveredEntities);
              inferredClaims.push(...response.discoveredClaims);

              if (response.status === "ok") {
                subTasksCompleted.push(subTask.goal);
              } else {
                errorMessage += `An error was encountered when completing the sub-task with goal "${subTask.goal}": ${response.reason}\n`;
              }
            }

            for (const { subTaskId, reason } of rejectedSubTasks) {
              const { goal } = subTasksWithIds.find(
                (subTask) => subTask.subTaskId === subTaskId,
              )!;

              errorMessage += `The sub-task with goal "${goal}" was rejected for the following reason: ${reason}\n`;
            }

            return {
              ...toolCall,
              ...nullReturns,
              inferredClaims,
              entitySummaries,
              subTasksCompleted,
              output: errorMessage || "Sub-tasks all completed.",
              isError: !!errorMessage,
            };
          } else if (toolCall.name === "complete") {
            if (!state.hasConductedCheckStep) {
              const warnings: string[] = [];

              if (state.proposedEntities.length === 0) {
                warnings.push("No entities have been proposed.");
              }

              const { entityIds } =
                toolCall.input as CoordinatorToolCallArguments["complete"];

              const invalidEntityIds = entityIds.filter(
                (entityId) =>
                  !state.proposedEntities.some(
                    ({ localEntityId }) => localEntityId === entityId,
                  ),
              );

              if (invalidEntityIds.length > 0) {
                return {
                  ...nullReturns,
                  ...toolCall,
                  output: dedent(`
                  The following entity IDs do not correspond to any proposed entities: ${JSON.stringify(
                    invalidEntityIds,
                  )}

                  ${
                    state.proposedEntities.length > 0
                      ? `Valid entity IDs are: ${JSON.stringify(
                          state.proposedEntities.map(
                            ({ localEntityId }) => localEntityId,
                          ),
                        )}`
                      : `You haven't discovered any entities yet.`
                  }
                `),
                  isError: true,
                };
              }

              // eslint-disable-next-line no-param-reassign
              state.submittedEntityIds = entityIds;
              const submittedEntities = getSubmittedEntities();

              const missingEntityTypes = input.entityTypes.filter(
                ({ $id }) =>
                  !submittedEntities.some(
                    ({ entityTypeId }) => entityTypeId === $id,
                  ),
              );

              if (missingEntityTypes.length > 0) {
                warnings.push(
                  `You have not proposed any entities for the following types: ${JSON.stringify(
                    missingEntityTypes.map(({ $id }) => $id),
                  )}`,
                );
              }

              const missingLinkEntityTypes = input.linkEntityTypes?.filter(
                ({ $id }) =>
                  !submittedEntities.some(
                    ({ entityTypeId }) => entityTypeId === $id,
                  ),
              );

              if (missingLinkEntityTypes && missingLinkEntityTypes.length > 0) {
                warnings.push(
                  dedent(`
                    You have not proposed any links for the following link types: ${JSON.stringify(
                      missingLinkEntityTypes.map(({ $id }) => $id),
                    )}
                `),
                );
              }

              if (warnings.length > 0) {
                logger.debug(
                  `Conducting check step with warnings: ${stringify(warnings)}`,
                );
                return {
                  ...nullReturns,
                  ...toolCall,
                  output: dedent(`
                    Are you sure the research task is complete considering the following warnings?

                    Warnings:
                    ${warnings.join("\n")}

                    If you are sure the task is complete, call the "complete" tool again.
                    Otherwise, either continue to make tool calls or call the "terminate" tool to end the task if it cannot be completed.
                  `),
                  isError: true,
                };
              } else {
                // eslint-disable-next-line no-param-reassign
                state.hasConductedCheckStep = true;
              }
            }

            return {
              ...toolCall,
              ...nullReturns,
              output: `The research task has been completed.`,
            };
          }

          throw new Error(`Unimplemented tool call: ${toolCall.name}`);
        },
      ),
    );

    const resourceUrlsVisited = completedToolCalls.flatMap(
      ({ resourceUrlsVisited: urlsVisited }) => urlsVisited ?? [],
    );

    // eslint-disable-next-line no-param-reassign
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

    state.webQueriesMade.push(
      ...completedToolCalls.flatMap(
        ({ webQueriesMade }) => webQueriesMade ?? [],
      ),
    );

    state.subTasksCompleted.push(
      ...completedToolCalls.flatMap(
        ({ subTasksCompleted }) => subTasksCompleted ?? [],
      ),
    );

    state.suggestionsForNextStepsMade.push(
      ...completedToolCalls.flatMap(
        ({ suggestionsForNextStepsMade }) => suggestionsForNextStepsMade ?? [],
      ),
    );

    const newEntitySummaries = completedToolCalls.flatMap(
      ({ entitySummaries }) => entitySummaries ?? [],
    );
    const newClaims = completedToolCalls.flatMap(
      ({ inferredClaims }) => inferredClaims ?? [],
    );

    /**
     * Update the state with the new claims and entity summaries inferred from the tool calls,
     * which includes the deduplication of entities and the conversion of claims into proposed entities.
     */
    await updateStateFromInferredClaims({
      input,
      state,
      newClaims,
      newEntitySummaries,
      workerIdentifiers,
    });

    const isCompleted = toolCalls.some(
      (toolCall) => toolCall.name === "complete",
    );

    /**
     * Check whether the research task has completed after processing the tool calls,
     * in case the agent has made other tool calls at the same time as the "complete" tool call.
     */
    if (isCompleted) {
      if (state.hasConductedCheckStep) {
        await createCheckpoint({ state });
        return;
      } else {
        // eslint-disable-next-line no-param-reassign
        state.hasConductedCheckStep = true;
      }
    }

    // eslint-disable-next-line no-param-reassign
    state.previousCalls = [...state.previousCalls, { completedToolCalls }];

    if (testingParams?.persistState) {
      testingParams.persistState(state);
    }

    await createCheckpoint({ state });

    const { toolCalls: nextToolCalls } =
      await coordinatingAgent.getNextToolCalls({
        input,
        state,
      });

    await processToolCalls({
      toolCalls: nextToolCalls,
    });
  };

  await processToolCalls({
    toolCalls: initialToolCalls,
  });

  /**
   * These are entities the coordinator has chosen to highlight as the result of research,
   * but we want to output all entity proposals from the task.
   * @todo do something with the highlighted entities, e.g.
   * - mark them for the user's attention
   * - pass them to future steps
   */
  const _submittedEntities = getSubmittedEntities();
  logger.debug(`Submitted ${_submittedEntities.length} entities`);

  const allProposedEntities = state.proposedEntities;

  const filesUsedToProposeEntities = allProposedEntities
    .flatMap((proposedEntity) => {
      const sourcesUsedToProposeEntity = [
        ...(proposedEntity.provenance.sources ?? []),
        ...flattenPropertyMetadata(proposedEntity.propertyMetadata).flatMap(
          ({ metadata }) => metadata.provenance?.sources ?? [],
        ),
      ];

      return sourcesUsedToProposeEntity.flatMap((source) => {
        if (
          source.location?.uri &&
          source.type === SourceType.Document &&
          /**
           * Exclude files we already have an entity for
           */
          !providedFileEntities.some((fileEntity) =>
            areUrlsTheSameAfterNormalization(
              fileEntity.properties[
                "https://blockprotocol.org/@blockprotocol/types/property-type/file-url/"
              ],
              source.location!.uri!,
            ),
          )
        ) {
          return {
            url: source.location.uri,
            entityTypeId: systemEntityTypes.pdfDocument.entityTypeId,
          };
        }

        return [];
      });
    })
    .filter(
      ({ url }, index, all) =>
        all.findIndex((file) => file.url === url) === index,
    );

  const fileEditionProvenance: ProposedEntity["provenance"] = {
    actorType: "ai",
    origin: {
      type: "flow",
      id: flowEntityId,
      stepIds: [stepId],
    } satisfies OriginProvenance,
  };

  /**
   * We return additional proposed entities for each file that was used to propose
   * the submitted entities, so that these are persisted in the graph.
   *
   * Note that uploading the file is handled in the "Persist Entity" action.
   */
  const fileEntityProposals: ProposedEntity[] = filesUsedToProposeEntities.map(
    ({ url, entityTypeId }) => ({
      claims: {
        isObjectOf: [],
        isSubjectOf: [],
      },
      /**
       * @todo: H-2728 set the web page this file was discovered in (if applicable) in the property provenance
       * for the `fileUrl`
       */
      propertyMetadata: { value: {} },
      provenance: fileEditionProvenance,
      entityTypeId,
      localEntityId: entityIdFromComponents(
        webId,
        generateUuid() as EntityUuid,
      ),
      properties: {
        "https://blockprotocol.org/@blockprotocol/types/property-type/file-url/":
          url,
      } satisfies FileProperties,
    }),
  );

  const now = new Date().toISOString();

  logProgress(
    fileEntityProposals.map((proposedFileEntity) => ({
      type: "ProposedEntity",
      proposedEntity: proposedFileEntity,
      recordedAt: now,
      stepId,
      ...workerIdentifiers,
    })),
  );

  logger.debug(`Proposed Entities: ${stringify(allProposedEntities)}`);
  logger.debug(`File Entities Proposed: ${stringify(fileEntityProposals)}`);

  logProgress([
    {
      type: "ClosedCoordinator",
      output: {
        entityCount: allProposedEntities.length + fileEntityProposals.length,
      },
      recordedAt: new Date().toISOString(),
      stepId,
      ...workerIdentifiers,
    },
  ]);

  return {
    code: StatusCode.Ok,
    contents: [
      {
        outputs: [
          {
            outputName:
              "proposedEntities" satisfies OutputNameForAction<"researchEntities">,
            payload: {
              kind: "ProposedEntity",
              value: [...allProposedEntities, ...fileEntityProposals],
            },
          },
        ],
      },
    ],
  };
};

export const researchEntitiesAction: FlowActionActivity<{
  testingParams?: {
    humanInputCanBeRequested?: boolean;
    persistState?: (state: CoordinatingAgentState) => void;
    resumeFromState?: CoordinatingAgentState;
  };
}> = async (params) => {
  const stateAtResetCheckpoint = await getCheckpoint();

  const state: CoordinatingAgentState = params.testingParams?.resumeFromState ??
    stateAtResetCheckpoint?.state ?? {
      coordinatorIdentifiers: {
        workerType: "Coordinator",
        workerInstanceId: generateUuid(),
        parentInstanceId: null,
      },
      entitySummaries: [],
      hasConductedCheckStep: false,
      inferredClaims: [],
      plan: "",
      previousCalls: [],
      proposedEntities: [],
      questionsAndAnswers: null,
      submittedEntityIds: [],
      subTasksCompleted: [],
      suggestionsForNextStepsMade: [],
      resourcesNotVisited: [],
      resourceUrlsVisited: [],
      webQueriesMade: [],
    };

  if (state.plan) {
    /**
     * This is a restart or reset of a workflow run.
     * Because state is currently only captured at the coordinator level, in-progress sub-agents may have done work
     * which have not been captured in the state, and needs to be undone to stop it being associated with the flow.
     *
     * This is currently only claims persisted in the graph but not yet reported to the coordinator.
     *
     * @todo improve this via one of
     *   - earlier report of discovered claims to the coordinator
     *   - maintain recoverable state in sub-agents
     */
    const { createEntitiesAsDraft, userAuthentication, flowEntityId, stepId } =
      await getFlowContext();

    const persistedClaims = await graphApiClient.getEntities(
      userAuthentication.actorId,
      {
        includeDrafts: createEntitiesAsDraft,
        temporalAxes: currentTimeInstantTemporalAxes,
        filter: {
          all: [
            generateVersionedUrlMatchingFilter(
              systemEntityTypes.claim.entityTypeId,
              { ignoreParents: true },
            ),
            {
              equal: [
                {
                  path: ["editionProvenance", "origin", "id"],
                },
                {
                  parameter: flowEntityId,
                },
              ],
            },
            {
              equal: [
                {
                  path: ["editionProvenance", "origin", "stepIds", 0],
                },
                {
                  parameter: stepId,
                },
              ],
            },
          ],
        },
      },
    );

    await Promise.all(
      persistedClaims.data.entities
        .filter(
          (claim) =>
            !state.inferredClaims.some(
              (claimInState) =>
                claimInState.claimId === claim.metadata.recordId.entityId,
            ),
        )
        .map(async (claim) =>
          graphApiClient.patchEntity(userAuthentication.actorId, {
            entityId: claim.metadata.recordId.entityId,
            archived: true,
          }),
        ),
    );
  }

  /**
   * This action (Temporal activity) handles cancellation, and we set the workflow to WAIT_CANCELLATION_COMPLETED,
   * which means we need to throw the cancelled error if and when we're notified of cancellation.
   *
   * execResearchEntitiesAction will continue to run until completion in any event, and so it has logic in various places
   * inside it to check if the activity has been cancelled (look for status: "aborted" or isActivityCancelled),
   * and to bail out of doing further work if so.
   *
   * @todo H-3129: refactor this action into a child workflow which calls other activities / child workflows,
   *    in which case any single activity which is running when the workflow is cancelled will be doing less work.
   *    There will still be a need to check for cancellation in these functions so that they can bail sooner to save resource
   *    and to avoid making undesired database mutations etc.
   */
  return Promise.race([
    execResearchEntitiesAction({
      ...params,
      state,
    }),
    heartbeatAndWaitCancellation(state),
  ]);
};
