import dedent from "dedent";
import type { VersionedUrl } from "@blockprotocol/type-system";
import type { OriginProvenance , SourceType } from "@local/hash-graph-client";
import { flattenPropertyMetadata } from "@local/hash-graph-sdk/entity";
import type { EntityId } from "@local/hash-graph-types/entity";
import type { OutputNameForAction } from "@local/hash-isomorphic-utils/flows/action-definitions";
import type { ProposedEntity } from "@local/hash-isomorphic-utils/flows/types";
import { generateUuid } from "@local/hash-isomorphic-utils/generate-uuid";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import type { FileProperties } from "@local/hash-isomorphic-utils/system-types/shared";
import { isNotNullish } from "@local/hash-isomorphic-utils/types";
import { StatusCode } from "@local/status";

import { logger } from "../shared/activity-logger.js";
import {
  areUrlsTheSameAfterNormalization,
  getFlowContext,
  getProvidedFiles,
} from "../shared/get-flow-context.js";
import type { ParsedLlmToolCall } from "../shared/get-llm-response/types.js";
import { logProgress } from "../shared/log-progress.js";
import { stringify } from "../shared/stringify.js";

import { checkSubTasksAgent } from "./research-entities-action/check-sub-tasks-agent.js";
import type {
 coordinatingAgent,  CoordinatingAgentInput,
  CoordinatingAgentState } from "./research-entities-action/coordinating-agent.js";
import type {
  CoordinatorToolCallArguments,
  CoordinatorToolName,
} from "./research-entities-action/coordinator-tools.js";
import type { deduplicateEntities,DuplicateReport  } from "./research-entities-action/deduplicate-entities.js";
import { getAnswersFromHuman } from "./research-entities-action/get-answers-from-human.js";
import { handleWebSearchToolCall } from "./research-entities-action/handle-web-search-tool-call.js";
import { linkFollowerAgent } from "./research-entities-action/link-follower-agent.js";
import { runSubTaskAgent } from "./research-entities-action/sub-task-agent.js";
import type { CompletedCoordinatorToolCall , nullReturns } from "./research-entities-action/types.js";
import type { LocalEntitySummary } from "./shared/infer-facts-from-text/get-entity-summaries-from-text.js";
import type { Fact } from "./shared/infer-facts-from-text/types.js";
import { proposeEntitiesFromFacts } from "./shared/propose-entities-from-facts.js";
import type { FlowActionActivity } from "./types.js";

export interface AccessedRemoteFile {
  entityTypeId: VersionedUrl;
  url: string;
  loadedAt: string;
}

const adjustDuplicates = (params: {
  duplicates: DuplicateReport[];
  entityIdsWhichCannotBeDeduplicated: EntityId[];
}) => {
  const { duplicates, entityIdsWhichCannotBeDeduplicated } = params;

  const adjustedDuplicates = duplicates.map<DuplicateReport>(
    ({ canonicalId, duplicateIds }) => {
      if (
        entityIdsWhichCannotBeDeduplicated.includes(canonicalId as EntityId)
      ) {
        return { canonicalId, duplicateIds };
      }

      const existingEntityIdMarkedAsDuplicate = duplicateIds.find((id) =>
        entityIdsWhichCannotBeDeduplicated.includes(id as EntityId),
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
 * Given newly discovered facts and entity summaries:
 * 1. Deduplicate entities
 * 2. Update the state with the new facts and entity summaries
 * 3. Create or update proposals for (1) new entities and (2) existing entities with new facts
 * 4. Update the state with the new and updated proposals.
 */
const updateStateFromInferredFacts = async (params: {
  input: CoordinatingAgentInput;
  state: CoordinatingAgentState;
  newFacts: Fact[];
  newEntitySummaries: LocalEntitySummary[];
}) => {
  const { input, state, newEntitySummaries, newFacts } = params;

  /**
   * Step 1: Deduplication (if necessary).
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
    const entityIdsWhichCannotBeDeduplicated = 
      /**
       * We don't want to deduplicate any entities that are already persisted in
       * the graph (i.e. The `existingEntities` passed in as input to the action).
       */
      (input.existingEntitySummaries ?? []).map(({ entityId }) => entityId)
    ;

    const adjustedDuplicates = adjustDuplicates({
      duplicates,
      entityIdsWhichCannotBeDeduplicated,
    });

    canonicalEntityIdsForNewDuplicates.push(
      ...adjustedDuplicates.map(({ canonicalId }) => canonicalId),
    );

    const inferredFactsWithDeduplicatedEntities = newFacts.map((fact) => {
      const { subjectEntityLocalId, objectEntityLocalId } = fact;
      const subjectDuplicate = adjustedDuplicates.find(({ duplicateIds }) =>
        duplicateIds.includes(subjectEntityLocalId),
      );

      const objectDuplicate = objectEntityLocalId
        ? duplicates.find(({ duplicateIds }) =>
            duplicateIds.includes(objectEntityLocalId),
          )
        : undefined;

      return {
        ...fact,
        subjectEntityLocalId:
          subjectDuplicate?.canonicalId ?? fact.subjectEntityLocalId,
        objectEntityLocalId:
          objectDuplicate?.canonicalId ?? objectEntityLocalId,
      };
    });

    state.inferredFacts.push(...inferredFactsWithDeduplicatedEntities);
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
   * Step 2: Create or update proposals for new entities and existing entities with new facts.
   */

  /**
   * We want to (re)propose entities which may have new information, via one of:
   * 1. Appearing as a new summary
   * 2. Being the subject or object of a new fact
   * 3. Having been identified as the canonical version of a new duplicate (which means it may have had new facts discovered).
   */
  const entityIdsToPropose = [
    ...new Set([
      ...newEntitySummaries.map(({ localId }) => localId),
      ...newFacts.flatMap(({ subjectEntityLocalId, objectEntityLocalId }) =>
        [subjectEntityLocalId, objectEntityLocalId].filter(isNotNullish),
      ),
      ...canonicalEntityIdsForNewDuplicates,
    ]),
  ];

  /**
   * Gather the facts which relate to the entities that are being proposed.
   */
  const entitySummaries = state.entitySummaries.filter(({ localId }) =>
    entityIdsToPropose.includes(localId),
  );

  const relevantFacts = state.inferredFacts.filter(
    ({ subjectEntityLocalId, objectEntityLocalId }) =>
      entityIdsToPropose.includes(subjectEntityLocalId) ||
      /**
       * Facts where the entity is the object may contain information which is useful in constructing it,
       * or a link from it – the fact may be expressed in the reverse direction to that of the target entity types.
       */
      (objectEntityLocalId && entityIdsToPropose.includes(objectEntityLocalId)),
  );

  /**
   * Given the affected entities, we also need the summaries of entities they may link to.
   */
  const potentialLinkTargetEntitySummaries = state.entitySummaries.filter(
    ({ localId }) =>
      relevantFacts.some(
        ({ objectEntityLocalId }) => localId === objectEntityLocalId,
      ),
  );

  /**
   * Get the updated proposals.
   */
  const { proposedEntities: newProposedEntities } =
    await proposeEntitiesFromFacts({
      dereferencedEntityTypes: input.allDereferencedEntityTypesById,
      entitySummaries,
      existingEntitySummaries: input.existingEntitySummaries,
      facts: relevantFacts,
      potentialLinkTargetEntitySummaries,
    });

  state.proposedEntities = [
    /**
     * Filter out any previous proposed entities that have been re-proposed with new facts.
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

export const researchEntitiesAction: FlowActionActivity<{
  testingParams?: {
    humanInputCanBeRequested?: boolean;
    persistState?: (state: CoordinatingAgentState) => void;
    resumeFromState?: CoordinatingAgentState;
  };
}> = async ({ inputs: stepInputs, testingParams }) => {
  const input = await coordinatingAgent.parseCoordinatorInputs({
    stepInputs,
    testingParams,
  });

  let state: CoordinatingAgentState;

  const { flowEntityId, stepId } = await getFlowContext();

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
      };
    });

  if (testingParams?.resumeFromState) {
    state = testingParams.resumeFromState;
  } else {
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

    state = {
      entitySummaries: [],
      hasConductedCheckStep: false,
      inferredFacts: [],
      plan: initialPlan,
      previousCalls: [],
      proposedEntities: [],
      questionsAndAnswers,
      submittedEntityIds: [],
      subTasksCompleted: [],
      suggestionsForNextStepsMade: [],
      resourcesNotVisited: providedFiles,
      resourceUrlsVisited: [],
      webQueriesMade: [],
    };

    if (testingParams?.persistState) {
      testingParams.persistState(state);
    }
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

            state.plan = plan;

            return {
              ...nullReturns,
              ...toolCall,
              output: `The plan has been successfully updated.`,
            };
          } if (toolCall.name === "requestHumanInput") {
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

            state.questionsAndAnswers =
              (state.questionsAndAnswers ?? "") + response;

            return {
              ...nullReturns,
              ...toolCall,
              output: response,
            };
          } if (toolCall.name === "webSearch") {
            const webPageSummaries = await handleWebSearchToolCall({
              input:
                toolCall.input as CoordinatorToolCallArguments["webSearch"],
            });

            return {
              ...nullReturns,
              ...toolCall,
              output: "Search successful",
              webPagesFromSearchQuery: webPageSummaries,
            };
          } if (toolCall.name === "inferFactsFromResources") {
            const { resources } =
              toolCall.input as CoordinatorToolCallArguments["inferFactsFromResources"];

            const validEntityTypeIds = input.entityTypes.map(({ $id }) => $id);

            const invalidEntityTypeIds = resources
              .flatMap(({ entityTypeIds }) => entityTypeIds)
              .filter(
                (entityTypeId) =>
                  !validEntityTypeIds.includes(entityTypeId as VersionedUrl),
              );

            const validLinkEntityTypeIds =
              input.linkEntityTypes?.map(({ $id }) => $id) ?? [];

            const invalidLinkEntityTypeIds = resources
              .flatMap(({ linkEntityTypeIds }) => linkEntityTypeIds ?? [])
              .filter(
                (entityTypeId) =>
                  !validLinkEntityTypeIds.includes(
                    entityTypeId as VersionedUrl,
                  ),
              );

            if (
              invalidEntityTypeIds.length > 0 ||
              invalidLinkEntityTypeIds.length > 0
            ) {
              return {
                ...toolCall,
                ...nullReturns,
                output: dedent(`
                  ${
                    invalidEntityTypeIds.length > 0
                      ? dedent(`
                        The following entity type IDs are invalid: ${JSON.stringify(
                          invalidEntityTypeIds,
                        )}

                        Valid entity type IDs are: ${JSON.stringify(
                          validEntityTypeIds,
                        )}
                      `)
                      : ""
                  }
                  ${
                    invalidLinkEntityTypeIds.length > 0
                      ? dedent(`
                        The following link entity type IDs are invalid: ${JSON.stringify(
                          invalidLinkEntityTypeIds,
                        )}

                        The valid link entity types type IDs are: ${JSON.stringify(
                          validLinkEntityTypeIds,
                        )}
                      `)
                      : ""
                  }

                `),
                isError: true,
              };
            }

            const responsesWithUrl = await Promise.all(
              resources.map(
                async ({
                  url,
                  prompt,
                  entityTypeIds,
                  linkEntityTypeIds,
                  relevantEntityIds,
                  descriptionOfExpectedContent,
                  exampleOfExpectedContent,
                  reason,
                }) => {
                  const relevantEntities = state.entitySummaries.filter(
                    ({ localId }) => relevantEntityIds?.includes(localId),
                  );

                  const response = await linkFollowerAgent({
                    initialResource: {
                      url,
                      descriptionOfExpectedContent,
                      exampleOfExpectedContent,
                      reason,
                    },
                    task: prompt,
                    existingEntitiesOfInterest: relevantEntities,
                    entityTypes: input.entityTypes.filter(
                      ({ $id }) =>
                        entityTypeIds.includes($id) ||
                        relevantEntities.some(
                          (entity) => entity.entityTypeId === $id,
                        ),
                    ),
                    linkEntityTypes: input.linkEntityTypes?.filter(
                      ({ $id }) =>
                        Boolean(linkEntityTypeIds?.includes($id)) ||
                        relevantEntities.some(
                          (entity) => entity.entityTypeId === $id,
                        ),
                    ),
                  });

                  return { response, url };
                },
              ),
            );

            const inferredFacts: Fact[] = [];
            const entitySummaries: LocalEntitySummary[] = [];
            const suggestionsForNextStepsMade: string[] = [];
            const resourceUrlsVisited: string[] = [];

            for (const { response } of responsesWithUrl) {
              inferredFacts.push(...response.facts);
              entitySummaries.push(...response.existingEntitiesOfInterest);
              suggestionsForNextStepsMade.push(response.suggestionForNextSteps);
              resourceUrlsVisited.push(
                ...response.exploredResources.map(({ url }) => url),
              );
            }

            return {
              ...toolCall,
              ...nullReturns,
              inferredFacts,
              entitySummaries,
              suggestionsForNextStepsMade,
              resourceUrlsVisited,
              output:
                entitySummaries.length > 0
                  ? "Entities inferred from web page"
                  : "No facts were inferred about any relevant entities.",
            };
          } if (toolCall.name === "startFactGatheringSubTasks") {
            const { subTasks } =
              toolCall.input as CoordinatorToolCallArguments["startFactGatheringSubTasks"];

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
                  const {
                    goal,
                    relevantEntityIds,
                    entityTypeIds,
                    linkEntityTypeIds,
                    explanation,
                  } = subTask;

                  const relevantEntities = state.entitySummaries.filter(
                    ({ localId }) => relevantEntityIds?.includes(localId),
                  );

                  const entityTypes = input.entityTypes.filter(
                    ({ $id }) =>
                      entityTypeIds.includes($id) ||
                      relevantEntities.some(
                        (entity) => entity.entityTypeId === $id,
                      ),
                  );

                  const linkEntityTypes = input.linkEntityTypes?.filter(
                    ({ $id }) =>
                      Boolean(linkEntityTypeIds?.includes($id)) ||
                      relevantEntities.some(
                        (entity) => entity.entityTypeId === $id,
                      ),
                  );

                  const existingFactsAboutRelevantEntities =
                    state.inferredFacts.filter(({ subjectEntityLocalId }) =>
                      relevantEntityIds?.includes(subjectEntityLocalId),
                    );

                  logProgress([
                    {
                      type: "StartedSubTask",
                      explanation,
                      goal,
                      recordedAt: new Date().toISOString(),
                      stepId,
                    },
                  ]);

                  const response = await runSubTaskAgent({
                    input: {
                      goal,
                      relevantEntities,
                      existingFactsAboutRelevantEntities,
                      entityTypes,
                      linkEntityTypes,
                    },
                  });

                  return { response, subTask };
                }),
            );

            const inferredFacts: Fact[] = [];
            const entitySummaries: LocalEntitySummary[] = [];
            const subTasksCompleted: string[] = [];

            let errorMessage = "";

            for (const { response, subTask } of responsesWithSubTask) {
              entitySummaries.push(...response.discoveredEntities);
              inferredFacts.push(...response.discoveredFacts);

              if (response.status === "ok") {
                subTasksCompleted.push(subTask.goal);
              } else {
                errorMessage = `${errorMessage  }An error was encountered when completing the sub-task with goal "${subTask.goal}": ${response.reason}\n`;
              }
            }

            for (const { subTaskId, reason } of rejectedSubTasks) {
              const { goal } = subTasksWithIds.find(
                (subTask) => subTask.subTaskId === subTaskId,
              )!;

              errorMessage = `${errorMessage  }The sub-task with goal "${goal}" was rejected for the following reason: ${reason}\n`;
            }

            return {
              ...toolCall,
              ...nullReturns,
              inferredFacts,
              entitySummaries,
              subTasksCompleted,
              output: errorMessage || "Sub-tasks all completed.",
              isError: Boolean(errorMessage),
            };
          } if (toolCall.name === "complete") {
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
              } 
                state.hasConductedCheckStep = true;
              
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
    const newFacts = completedToolCalls.flatMap(
      ({ inferredFacts }) => inferredFacts ?? [],
    );

    /**
     * Update the state with the new facts and entity summaries inferred from the tool calls,
     * which includes the deduplication of entities and the conversion of facts into proposed entities.
     */
    await updateStateFromInferredFacts({
      input,
      state,
      newFacts,
      newEntitySummaries,
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
        return;
      } 
        state.hasConductedCheckStep = true;
      
    }

    state.previousCalls = [...state.previousCalls, { completedToolCalls }];

    if (testingParams?.persistState) {
      testingParams.persistState(state);
    }

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
   *
   * @todo Do something with the highlighted entities, e.g.
   * - mark them for the user's attention
   * - pass them to future steps.
   */
  const _submittedEntities = getSubmittedEntities();

  logger.debug(`Submitted Entities: ${stringify(_submittedEntities)}`);

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
           * Exclude files we already have an entity for.
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
      /**
       * @todo: H-2728 set the web page this file was discovered in (if applicable) in the property provenance
       * for the `fileUrl`
       */
      propertyMetadata: { value: {} },
      provenance: fileEditionProvenance,
      entityTypeId,
      localEntityId: generateUuid(),
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
    })),
  );

  logger.debug(`Proposed Entities: ${stringify(allProposedEntities)}`);
  logger.debug(`File Entities Proposed: ${stringify(fileEntityProposals)}`);

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
