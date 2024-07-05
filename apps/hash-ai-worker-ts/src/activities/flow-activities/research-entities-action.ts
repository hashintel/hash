import type { VersionedUrl } from "@blockprotocol/type-system";
import type { OriginProvenance } from "@local/hash-graph-client";
import { SourceType } from "@local/hash-graph-client";
import { flattenPropertyMetadata } from "@local/hash-graph-sdk/entity";
import type { EntityId } from "@local/hash-graph-types/entity";
import type { OutputNameForAction } from "@local/hash-isomorphic-utils/flows/action-definitions";
import type { ProposedEntity } from "@local/hash-isomorphic-utils/flows/types";
import { generateUuid } from "@local/hash-isomorphic-utils/generate-uuid";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import type { FileProperties } from "@local/hash-isomorphic-utils/system-types/shared";
import { isNotNullish } from "@local/hash-isomorphic-utils/types";
import { StatusCode } from "@local/status";
import dedent from "dedent";

import { logger } from "../shared/activity-logger";
import { getFlowContext } from "../shared/get-flow-context";
import type { ParsedLlmToolCall } from "../shared/get-llm-response/types";
import { logProgress } from "../shared/log-progress";
import { stringify } from "../shared/stringify";
import { checkSubTasksAgent } from "./research-entities-action/check-sub-tasks-agent";
import type {
  CoordinatingAgentInput,
  CoordinatingAgentState,
} from "./research-entities-action/coordinating-agent";
import { coordinatingAgent } from "./research-entities-action/coordinating-agent";
import type {
  CoordinatorToolCallArguments,
  CoordinatorToolName,
} from "./research-entities-action/coordinator-tools";
import type { DuplicateReport } from "./research-entities-action/deduplicate-entities";
import { deduplicateEntities } from "./research-entities-action/deduplicate-entities";
import { getAnswersFromHuman } from "./research-entities-action/get-answers-from-human";
import { handleWebSearchToolCall } from "./research-entities-action/handle-web-search-tool-call";
import { linkFollowerAgent } from "./research-entities-action/link-follower-agent";
import { runSubTaskAgent } from "./research-entities-action/sub-task-agent";
import type { CompletedCoordinatorToolCall } from "./research-entities-action/types";
import { nullReturns } from "./research-entities-action/types";
import type { LocalEntitySummary } from "./shared/infer-facts-from-text/get-entity-summaries-from-text";
import type { Fact } from "./shared/infer-facts-from-text/types";
import { proposeEntitiesFromFacts } from "./shared/propose-entities-from-facts";
import type { FlowActionActivity } from "./types";

export type AccessedRemoteFile = {
  entityTypeId: VersionedUrl;
  url: string;
  loadedAt: string;
};

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
 * 4. Update the state with the new and updated proposals
 */
const updateStateFromInferredFacts = async (params: {
  input: CoordinatingAgentInput;
  state: CoordinatingAgentState;
  newFacts: Fact[];
  newEntitySummaries: LocalEntitySummary[];
}) => {
  const { input, state, newEntitySummaries, newFacts } = params;

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
   * Step 2: Create or update proposals for new entities and existing entities with new facts
   */

  /**
   * We want to (re)propose entities which may have new information, via one of:
   * 1. Appearing as a new summary
   * 2. Being the subject or object of a new fact
   * 3. Having been identified as the canonical version of a new duplicate (which means it may have had new facts discovered)
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
   * Gather the facts which relate to the entities that are being proposed
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
   * Get the updated proposals
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
      webPagesNotVisited: [],
      webPageUrlsVisited: [],
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

  const { flowEntityId, stepId } = await getFlowContext();

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
            });

            return {
              ...nullReturns,
              ...toolCall,
              output: "Search successful",
              webPagesFromSearchQuery: webPageSummaries,
            };
          } else if (toolCall.name === "inferFactsFromWebPages") {
            const { webPages } =
              toolCall.input as CoordinatorToolCallArguments["inferFactsFromWebPages"];

            const validEntityTypeIds = input.entityTypes.map(({ $id }) => $id);

            const invalidEntityTypeIds = webPages
              .flatMap(({ entityTypeIds }) => entityTypeIds)
              .filter(
                (entityTypeId) =>
                  !validEntityTypeIds.includes(entityTypeId as VersionedUrl),
              );

            const validLinkEntityTypeIds =
              input.linkEntityTypes?.map(({ $id }) => $id) ?? [];

            const invalidLinkEntityTypeIds = webPages
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
              webPages.map(
                async ({
                  url,
                  prompt,
                  entityTypeIds,
                  linkEntityTypeIds,
                  descriptionOfExpectedContent,
                  exampleOfExpectedContent,
                  reason,
                }) => {
                  const response = await linkFollowerAgent({
                    initialResource: {
                      url,
                      descriptionOfExpectedContent,
                      exampleOfExpectedContent,
                      reason,
                    },
                    task: prompt,
                    entityTypes: input.entityTypes.filter(({ $id }) =>
                      entityTypeIds.includes($id),
                    ),
                    linkEntityTypes: input.linkEntityTypes?.filter(
                      ({ $id }) => linkEntityTypeIds?.includes($id) ?? false,
                    ),
                  });

                  return { response, url };
                },
              ),
            );

            const inferredFacts: Fact[] = [];
            const entitySummaries: LocalEntitySummary[] = [];
            const suggestionsForNextStepsMade: string[] = [];
            const webPageUrlsVisited: string[] = [];

            for (const { response } of responsesWithUrl) {
              inferredFacts.push(...response.facts);
              entitySummaries.push(...response.entitySummaries);
              suggestionsForNextStepsMade.push(response.suggestionForNextSteps);
              webPageUrlsVisited.push(
                ...response.exploredResources.map(({ url }) => url),
              );
            }

            return {
              ...toolCall,
              ...nullReturns,
              inferredFacts,
              entitySummaries,
              suggestionsForNextStepsMade,
              webPageUrlsVisited,
              output:
                entitySummaries.length > 0
                  ? "Entities inferred from web page"
                  : "No facts were inferred about any relevant entities.",
            };
          } else if (toolCall.name === "startFactGatheringSubTasks") {
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

                  const entityTypes = input.entityTypes.filter(({ $id }) =>
                    entityTypeIds.includes($id),
                  );

                  const linkEntityTypes = input.linkEntityTypes?.filter(
                    ({ $id }) => linkEntityTypeIds?.includes($id) ?? false,
                  );

                  const relevantEntities = state.entitySummaries.filter(
                    ({ localId }) => relevantEntityIds?.includes(localId),
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

            let errorMessage: string = "";

            for (const { response, subTask } of responsesWithSubTask) {
              entitySummaries.push(...response.discoveredEntities);
              inferredFacts.push(...response.discoveredFacts);

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
              inferredFacts,
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

    const webPageUrlsVisited = completedToolCalls.flatMap(
      ({ webPageUrlsVisited: urlsVisited }) => urlsVisited ?? [],
    );

    state.webPageUrlsVisited = [
      ...new Set([...webPageUrlsVisited, ...state.webPageUrlsVisited]),
    ];

    const newWebPages = completedToolCalls
      .flatMap(({ webPagesFromSearchQuery }) => webPagesFromSearchQuery ?? [])
      .filter(
        (webPage) =>
          !state.webPagesNotVisited.find((page) => page.url === webPage.url) &&
          !state.webPageUrlsVisited.includes(webPage.url),
      );

    state.webPagesNotVisited.push(...newWebPages);

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
      } else {
        state.hasConductedCheckStep = true;
      }
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

  const submittedEntities = getSubmittedEntities();

  const filesUsedToProposeSubmittedEntities = submittedEntities
    .flatMap((submittedEntity) => {
      const sourcesUsedToProposeEntity = [
        ...(submittedEntity.provenance?.sources ?? []),
        ...flattenPropertyMetadata(
          submittedEntity.propertyMetadata ?? { value: {} },
        ).flatMap(({ metadata }) => metadata.provenance?.sources ?? []),
      ];

      return sourcesUsedToProposeEntity.flatMap((source) => {
        if (source.location?.uri && source.type === SourceType.Document) {
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
  const fileEntityProposals: ProposedEntity[] =
    filesUsedToProposeSubmittedEntities.map(({ url, entityTypeId }) => ({
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
    }));

  const now = new Date().toISOString();

  logProgress(
    fileEntityProposals.map((proposedFileEntity) => ({
      type: "ProposedEntity",
      proposedEntity: proposedFileEntity,
      recordedAt: now,
      stepId,
    })),
  );

  logger.debug(`Submitted Entities: ${stringify(submittedEntities)}`);
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
              value: [...submittedEntities, ...fileEntityProposals],
            },
          },
        ],
      },
    ],
  };
};
