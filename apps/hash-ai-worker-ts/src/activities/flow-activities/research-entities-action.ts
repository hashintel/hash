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
import type { CompletedToolCall } from "./research-entities-action/types";
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

const updateStateFromInferredFacts = async (params: {
  skipDeduplication: boolean;
  input: CoordinatingAgentInput;
  state: CoordinatingAgentState;
  inferredFacts: Fact[];
  inferredFactsAboutEntities: LocalEntitySummary[];
}) => {
  const {
    input,
    state,
    inferredFactsAboutEntities,
    inferredFacts,
    skipDeduplication,
  } = params;

  if (skipDeduplication) {
    state.inferredFactsAboutEntities = inferredFactsAboutEntities;
    state.inferredFacts = inferredFacts;
  } else {
    const { duplicates } = await deduplicateEntities({
      entities: [
        ...(input.existingEntitySummaries ?? []),
        ...inferredFactsAboutEntities,
        ...state.inferredFactsAboutEntities,
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

    const inferredFactsWithDeduplicatedEntities = inferredFacts.map((fact) => {
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
    state.inferredFactsAboutEntities = [
      ...state.inferredFactsAboutEntities,
      ...inferredFactsAboutEntities,
    ].filter(
      ({ localId }) =>
        !duplicates.some(({ duplicateIds }) => duplicateIds.includes(localId)),
    );
    /**
     * Account for any previously proposed entities with a local ID which has
     * been marked as a duplicate.
     */
    state.proposedEntities = state.proposedEntities.map((proposedEntity) => {
      const duplicate = duplicates.find(({ duplicateIds }) =>
        duplicateIds.includes(proposedEntity.localEntityId),
      );

      return duplicate
        ? {
            ...proposedEntity,
            localEntityId: duplicate.canonicalId,
          }
        : proposedEntity;
    });
    /**
     * Account for any previously submitted entity ID which has been marked
     * as a duplicate.
     */
    state.submittedEntityIds = state.submittedEntityIds.map((entityId) => {
      const duplicate = duplicates.find(({ duplicateIds }) =>
        duplicateIds.includes(entityId),
      );

      return duplicate ? duplicate.canonicalId : entityId;
    });
  }
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
      plan: initialPlan,
      proposedEntities: [],
      submittedEntityIds: [],
      previousCalls: [],
      inferredFactsAboutEntities: [],
      inferredFacts: [],
      hasConductedCheckStep: false,
      questionsAndAnswers,
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

  const getSubmittedProposedEntities = () =>
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
        async (toolCall): Promise<CompletedToolCall<CoordinatorToolName>> => {
          if (toolCall.name === "updatePlan") {
            const { plan } =
              toolCall.input as CoordinatorToolCallArguments["updatePlan"];

            state.plan = plan;

            return {
              ...toolCall,
              output: `The plan has been successfully updated.`,
            };
          } else if (toolCall.name === "requestHumanInput") {
            const { questions } =
              toolCall.input as CoordinatorToolCallArguments["requestHumanInput"];

            if (questions.length === 0) {
              return {
                ...toolCall,
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
              ...toolCall,
              output: response,
            };
          } else if (toolCall.name === "submitProposedEntities") {
            const { entityIds } =
              toolCall.input as CoordinatorToolCallArguments["submitProposedEntities"];

            const invalidEntityIds = entityIds.filter(
              (entityId) =>
                !state.proposedEntities.some(
                  ({ localEntityId }) => localEntityId === entityId,
                ),
            );

            if (invalidEntityIds.length > 0) {
              return {
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
                      : `You haven't proposed any entities so far with the "proposeEntitiesFromFacts" tool.`
                  }
                `),
                isError: true,
              };
            }

            state.submittedEntityIds.push(...entityIds);

            return {
              ...toolCall,
              output: `The entities with IDs ${JSON.stringify(
                entityIds,
              )} were successfully submitted.`,
            };
          } else if (toolCall.name === "webSearch") {
            const { output } = await handleWebSearchToolCall({
              input:
                toolCall.input as CoordinatorToolCallArguments["webSearch"],
            });

            return {
              ...toolCall,
              output,
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

            let outputMessage = "";

            const inferredFacts: Fact[] = [];
            const inferredFactsAboutEntities: LocalEntitySummary[] = [];

            for (const { response, url } of responsesWithUrl) {
              inferredFacts.push(...response.facts);
              inferredFactsAboutEntities.push(...response.entitySummaries);

              outputMessage += `Inferred ${
                response.facts.length
              } facts on the web page with url ${url} for the following entities: ${stringify(
                response.entitySummaries.map(({ name, summary }) => ({
                  name,
                  summary,
                })),
              )}. ${response.suggestionForNextSteps}\n`;
            }

            outputMessage += dedent(`
              If further research is needed to fill more properties of the entities,
                consider defining them as sub-tasks via the "startFactGatheringSubTasks" tool.

              Do not sequentially conduct additional web searches for each of the entities,
                instead start multiple sub-tasks via the "startFactGatheringSubTasks" tool to
                conduct additional research per entity in parallel.
            `);

            if (inferredFactsAboutEntities.length > 0) {
              await updateStateFromInferredFacts({
                input,
                state,
                inferredFacts,
                inferredFactsAboutEntities,
                /**
                 * Skip deduplication if facts were only inferred from a single web page,
                 * and there are no existing entities or inferred facts about entities.
                 */
                skipDeduplication:
                  webPages.length === 1 &&
                  (input.existingEntities ?? []).length === 0 &&
                  state.inferredFactsAboutEntities.length === 0,
              });

              return {
                ...toolCall,
                output: outputMessage,
              };
            }

            return {
              ...toolCall,
              output: "No facts were inferred about any relevant entities.",
            };
          } else if (toolCall.name === "proposeEntitiesFromFacts") {
            const { entityIds } =
              toolCall.input as CoordinatorToolCallArguments["proposeEntitiesFromFacts"];

            const entitySummaries = state.inferredFactsAboutEntities.filter(
              ({ localId }) => entityIds.includes(localId),
            );

            const relevantFacts = state.inferredFacts.filter(
              ({ subjectEntityLocalId }) =>
                entityIds.includes(subjectEntityLocalId),
            );

            const { proposedEntities: newProposedEntities } =
              await proposeEntitiesFromFacts({
                dereferencedEntityTypes: input.allDereferencedEntityTypesById,
                entitySummaries,
                existingEntitySummaries: input.existingEntitySummaries,
                facts: relevantFacts,
              });

            state.proposedEntities = [
              /**
               * Filter out any previous proposed entities that have been re-proposed
               * with new facts.
               *
               * This may occur when the coordinator agent identifies that entities are
               * missing some properties after having proposed them, and conducts further
               * fact gathering research to fill in the missing properties.
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

            return {
              ...toolCall,
              output: dedent(`
                ${newProposedEntities.length} entities were successfully proposed.
              `),
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

                  const relevantEntities =
                    state.inferredFactsAboutEntities.filter(({ localId }) =>
                      relevantEntityIds.includes(localId),
                    );

                  const existingFactsAboutRelevantEntities =
                    state.inferredFacts.filter(({ subjectEntityLocalId }) =>
                      relevantEntityIds.includes(subjectEntityLocalId),
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
            const inferredFactsAboutEntities: LocalEntitySummary[] = [];

            let output: string = "";

            for (const { response, subTask } of responsesWithSubTask) {
              inferredFactsAboutEntities.push(...response.discoveredEntities);
              inferredFacts.push(...response.discoveredFacts);

              if (response.status === "ok") {
                output += `The sub-task with goal "${subTask.goal}" resulted in ${response.discoveredFacts.length} new facts. ${response.explanation}\n`;
              } else {
                output += `An error was encountered when completing the sub-task with goal "${subTask.goal}": ${response.reason}\n`;
              }
            }

            for (const { subTaskId, reason } of rejectedSubTasks) {
              const { goal } = subTasksWithIds.find(
                (subTask) => subTask.subTaskId === subTaskId,
              )!;

              output += `The sub-task with goal "${goal}" was rejected for the following reason: ${reason}\n`;
            }

            if (inferredFactsAboutEntities.length > 0) {
              await updateStateFromInferredFacts({
                input,
                state,
                inferredFacts,
                inferredFactsAboutEntities,
                /**
                 * Skip deduplication if facts were only gathered in a single sub-task,
                 * and there are no existing entities or inferred facts about entities.
                 */
                skipDeduplication:
                  acceptedSubTasks.length === 1 &&
                  (input.existingEntities ?? []).length === 0 &&
                  state.inferredFactsAboutEntities.length === 0,
              });
            }

            return {
              ...toolCall,
              output,
            };
          } else if (toolCall.name === "complete") {
            if (!state.hasConductedCheckStep) {
              const warnings: string[] = [];

              if (state.proposedEntities.length === 0) {
                warnings.push("No entities have been proposed.");
              }

              const submittedProposedEntities = getSubmittedProposedEntities();

              const missingEntityTypes = input.entityTypes.filter(
                ({ $id }) =>
                  !submittedProposedEntities.some(
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
                  !submittedProposedEntities.some(
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
              output: `The research task has been completed.`,
            };
          }

          throw new Error(`Unimplemented tool call: ${toolCall.name}`);
        },
      ),
    );

    const isCompleted = toolCalls.some(
      (toolCall) => toolCall.name === "complete",
    );

    /**
     * Check whether the research task has completed after processing the tool calls,
     * incase the agent has made other tool calls at the same time as the "complete" tool call.
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

  const submittedProposedEntities = getSubmittedProposedEntities();

  const filesUsedToProposeSubmittedEntities = submittedProposedEntities
    .flatMap((submittedProposedEntity) => {
      const sourcesUsedToProposeEntity = [
        ...(submittedProposedEntity.provenance.sources ?? []),
        ...flattenPropertyMetadata(
          submittedProposedEntity.propertyMetadata ?? { value: {} },
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

  logger.debug(
    `Submitted Proposed Entities: ${stringify(submittedProposedEntities)}`,
  );
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
              value: [...submittedProposedEntities, ...fileEntityProposals],
            },
          },
        ],
      },
    ],
  };
};
