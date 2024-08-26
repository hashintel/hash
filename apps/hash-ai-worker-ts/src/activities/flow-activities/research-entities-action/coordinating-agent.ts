import {
  type OriginProvenance,
  SourceType,
} from "@local/hash-graph-client/dist/index.d";
import { flattenPropertyMetadata } from "@local/hash-graph-sdk/entity";
import type { EntityUuid } from "@local/hash-graph-types/entity";
import {
  getSimplifiedActionInputs,
  type OutputNameForAction,
} from "@local/hash-isomorphic-utils/flows/action-definitions";
import type {
  ProposedEntity,
  StepInput,
  WorkerIdentifiers,
} from "@local/hash-isomorphic-utils/flows/types";
import { generateUuid } from "@local/hash-isomorphic-utils/generate-uuid";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import type { FileProperties } from "@local/hash-isomorphic-utils/system-types/shared";
import { entityIdFromComponents } from "@local/hash-subgraph";
import { StatusCode } from "@local/status";
import { Context } from "@temporalio/activity";
import dedent from "dedent";

import { getDereferencedEntityTypesActivity } from "../../get-dereferenced-entity-types-activity.js";
import { logger } from "../../shared/activity-logger.js";
import {
  areUrlsTheSameAfterNormalization,
  getFlowContext,
  getProvidedFiles,
} from "../../shared/get-flow-context.js";
import type { ParsedLlmToolCall } from "../../shared/get-llm-response/types.js";
import { graphApiClient } from "../../shared/graph-api-client.js";
import { logProgress } from "../../shared/log-progress.js";
import { mapActionInputEntitiesToEntities } from "../../shared/map-action-input-entities-to-entities.js";
import { stringify } from "../../shared/stringify.js";
import type { LocalEntitySummary } from "../shared/infer-summaries-then-claims-from-text/get-entity-summaries-from-text.js";
import type { Claim } from "../shared/infer-summaries-then-claims-from-text/types.js";
import type { FlowActionActivity } from "../types.js";
import { createCheckpoint } from "./checkpoints.js";
import { checkDelegatedTasksAgent } from "./coordinating-agent/check-delegated-tasks-agent.js";
import { createInitialPlan } from "./coordinating-agent/create-initial-plan.js";
import { requestCoordinatorActions } from "./coordinating-agent/request-coordinator-actions.js";
import type { ExistingEntitySummary } from "./coordinating-agent/summarize-existing-entities.js";
import { summarizeExistingEntities } from "./coordinating-agent/summarize-existing-entities.js";
import { updateStateFromInferredClaims } from "./coordinating-agent/update-state-from-inferred-claims.js";
import { getAnswersFromHuman } from "./get-answers-from-human.js";
import { linkFollowerAgent } from "./link-follower-agent.js";
import type {
  CompletedCoordinatorToolCall,
  CoordinatorToolCallArguments,
  CoordinatorToolName,
} from "./shared/coordinator-tools.js";
import { nullReturns } from "./shared/coordinator-tools.js";
import type {
  CoordinatingAgentInput,
  CoordinatingAgentState,
} from "./shared/coordinators.js";
import { handleWebSearchToolCall } from "./shared/handle-web-search-tool-call.js";
import { runSubCoordinatingAgent } from "./sub-coordinating-agent.js";

const parseCoordinatorInputs = async (params: {
  stepInputs: StepInput[];
  testingParams?: {
    humanInputCanBeRequested?: boolean;
  };
}): Promise<CoordinatingAgentInput> => {
  const { stepInputs, testingParams } = params;

  const {
    prompt,
    entityTypeIds,
    existingEntities: inputExistingEntities,
    reportSpecification,
  } = getSimplifiedActionInputs({
    inputs: stepInputs,
    actionType: "researchEntities",
  });

  const { userAuthentication } = await getFlowContext();

  /**
   * @todo: simplify the properties in the existing entities
   */
  const existingEntities = inputExistingEntities
    ? mapActionInputEntitiesToEntities({ inputEntities: inputExistingEntities })
    : undefined;

  let existingEntitySummaries: ExistingEntitySummary[] | undefined = undefined;

  if (existingEntities && existingEntities.length > 0) {
    existingEntitySummaries = (
      await summarizeExistingEntities({
        existingEntities,
      })
    ).existingEntitySummaries;
  }

  const dereferencedEntityTypes = await getDereferencedEntityTypesActivity({
    graphApiClient,
    entityTypeIds: [
      ...entityTypeIds!,
      ...(existingEntities?.map(({ metadata }) => metadata.entityTypeId) ?? []),
    ].filter((entityTypeId, index, all) => all.indexOf(entityTypeId) === index),
    actorId: userAuthentication.actorId,
    simplifyPropertyKeys: true,
  });

  const entityTypes = Object.values(dereferencedEntityTypes)
    .filter(
      ({ isLink, schema }) => entityTypeIds!.includes(schema.$id) && !isLink,
    )
    .map(({ schema }) => schema);

  const linkEntityTypes = Object.values(dereferencedEntityTypes)
    .filter(
      ({ isLink, schema }) => entityTypeIds!.includes(schema.$id) && isLink,
    )
    .map(({ schema }) => schema);

  return {
    humanInputCanBeRequested: testingParams?.humanInputCanBeRequested ?? true,
    prompt,
    reportSpecification,
    entityTypes,
    linkEntityTypes: linkEntityTypes.length > 0 ? linkEntityTypes : undefined,
    allDereferencedEntityTypesById: dereferencedEntityTypes,
    existingEntities,
    existingEntitySummaries,
  };
};

/**
 * This is the function that takes starting coordinating agent state and has the coordinator orchestrate the research
 * task.
 */
export const runCoordinatingAgent: FlowActionActivity<{
  state: CoordinatingAgentState;
  testingParams?: {
    humanInputCanBeRequested?: boolean;
    persistState?: (state: CoordinatingAgentState) => void;
    resumeFromState?: CoordinatingAgentState;
  };
}> = async ({ inputs: stepInputs, state, testingParams }) => {
  const workerIdentifiers = state.coordinatorIdentifiers;

  const input = await parseCoordinatorInputs({
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
    const { plan: initialPlan, questionsAndAnswers } = await createInitialPlan({
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

  const { toolCalls: initialToolCalls } = await requestCoordinatorActions({
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
          } else if (toolCall.name === "delegateResearchTasks") {
            const { delegatedTasks } =
              toolCall.input as CoordinatorToolCallArguments["delegateResearchTasks"];

            let counter = 0;

            const delegatedTasksWithIds = delegatedTasks.map(
              (delegatedTask) => ({
                ...delegatedTask,
                delegatedTaskId: `${counter++}`,
              }),
            );

            const { acceptedDelegatedTasks, rejectedDelegatedTasks } =
              await checkDelegatedTasksAgent({
                input,
                state,
                delegatedTasks: delegatedTasksWithIds,
              });

            const responsesWithDelegatedTask = await Promise.all(
              delegatedTasksWithIds
                .filter((delegatedTask) =>
                  acceptedDelegatedTasks.some(
                    ({ delegatedTaskId }) =>
                      delegatedTaskId === delegatedTask.delegatedTaskId,
                  ),
                )
                .map(async (delegatedTask) => {
                  const { goal, relevantEntityIds, explanation } =
                    delegatedTask;

                  const relevantEntities = state.entitySummaries.filter(
                    ({ localId }) => relevantEntityIds?.includes(localId),
                  );

                  const existingClaimsAboutRelevantEntities =
                    state.inferredClaims.filter(({ subjectEntityLocalId }) =>
                      relevantEntityIds?.includes(subjectEntityLocalId),
                    );

                  const delegatedTaskIdentifiers: WorkerIdentifiers = {
                    workerType: "Sub-coordinator",
                    workerInstanceId: generateUuid(),
                    parentInstanceId: workerIdentifiers.workerInstanceId,
                  };

                  logProgress([
                    {
                      type: "StartedSubCoordinator",
                      explanation,
                      input: {
                        goal,
                        entityTypeTitles: input.entityTypes.map(
                          (type) => type.title,
                        ),
                      },
                      recordedAt: new Date().toISOString(),
                      stepId,
                      ...delegatedTaskIdentifiers,
                    },
                  ]);

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
                        response.status !== "ok"
                          ? response.explanation
                          : undefined,
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

                  return { response, delegatedTask };
                }),
            );

            const inferredClaims: Claim[] = [];
            const entitySummaries: LocalEntitySummary[] = [];
            const delegatedTasksCompleted: string[] = [];

            let errorMessage: string = "";

            for (const {
              response,
              delegatedTask,
            } of responsesWithDelegatedTask) {
              entitySummaries.push(...response.discoveredEntities);
              inferredClaims.push(...response.discoveredClaims);

              if (response.status === "ok") {
                delegatedTasksCompleted.push(delegatedTask.goal);
              } else {
                errorMessage += `An error was encountered when completing the sub-task with goal "${delegatedTask.goal}": ${response.explanation}\n`;
              }
            }

            for (const { delegatedTaskId, reason } of rejectedDelegatedTasks) {
              const { goal } = delegatedTasksWithIds.find(
                (delegatedTask) =>
                  delegatedTask.delegatedTaskId === delegatedTaskId,
              )!;

              errorMessage += `The sub-task with goal "${goal}" was rejected for the following reason: ${reason}\n`;
            }

            return {
              ...toolCall,
              ...nullReturns,
              inferredClaims,
              entitySummaries,
              delegatedTasksCompleted,
              output: errorMessage || "Delegated tasks all completed.",
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

    state.delegatedTasksCompleted.push(
      ...completedToolCalls.flatMap(
        ({ delegatedTasksCompleted }) => delegatedTasksCompleted ?? [],
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

    const { toolCalls: nextToolCalls } = await requestCoordinatorActions({
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
