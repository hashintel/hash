import type { VersionedUrl } from "@blockprotocol/type-system";
import type { OriginProvenance } from "@local/hash-graph-client";
import type { EntityId } from "@local/hash-graph-types/entity";
import type {
  InputNameForAction,
  OutputNameForAction,
} from "@local/hash-isomorphic-utils/flows/action-definitions";
import { actionDefinitions } from "@local/hash-isomorphic-utils/flows/action-definitions";
import type {
  ProposedEntity,
  StepInput,
} from "@local/hash-isomorphic-utils/flows/types";
import { generateUuid } from "@local/hash-isomorphic-utils/generate-uuid";
import type { FileProperties } from "@local/hash-isomorphic-utils/system-types/shared";
import { StatusCode } from "@local/status";
import { Context } from "@temporalio/activity";
import dedent from "dedent";

import { logger } from "../shared/activity-logger";
import { getFlowContext } from "../shared/get-flow-context";
import type { ParsedLlmToolCall } from "../shared/get-llm-response/types";
import { logProgress } from "../shared/log-progress";
import { stringify } from "../shared/stringify";
import { getWebPageSummaryAction } from "./get-web-page-summary-action";
import type { CoordinatingAgentState } from "./research-entities-action/coordinating-agent";
import { coordinatingAgent } from "./research-entities-action/coordinating-agent";
import type {
  CoordinatorToolCallArguments,
  CoordinatorToolName,
} from "./research-entities-action/coordinator-tools";
import type { DuplicateReport } from "./research-entities-action/deduplicate-entities";
import { deduplicateEntities } from "./research-entities-action/deduplicate-entities";
import { getAnswersFromHuman } from "./research-entities-action/get-answers-from-human";
import { inferFactsFromWebPageWorkerAgent } from "./research-entities-action/infer-facts-from-web-page-worker-agent";
import type { CompletedToolCall } from "./research-entities-action/types";
import { proposeEntitiesFromFacts } from "./shared/propose-entities-from-facts";
import type { FlowActionActivity } from "./types";
import { webSearchAction } from "./web-search-action";

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
      filesUsedToInferFacts: [],
      inferredFacts: [],
      hasConductedCheckStep: false,
      filesUsedToProposeEntities: [],
      questionsAndAnswers,
    };
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

                  ${state.proposedEntities.length > 0 ? `Valid entity IDs are: ${JSON.stringify(state.proposedEntities.map(({ localEntityId }) => localEntityId))}` : `You haven't proposed any entities so far with the "proposeEntitiesFromFacts" tool.`}
                `),
                isError: true,
              };
            }

            state.submittedEntityIds.push(...entityIds);

            return {
              ...toolCall,
              output: `The entities with IDs ${JSON.stringify(entityIds)} were successfully submitted.`,
            };
          } else if (toolCall.name === "getSummariesOfWebPages") {
            const { webPageUrls, explanation } =
              toolCall.input as CoordinatorToolCallArguments["getSummariesOfWebPages"];

            const summaries = await Promise.all(
              webPageUrls.map(async (webPageUrl) => {
                const response = await getWebPageSummaryAction({
                  inputs: [
                    {
                      inputName:
                        "url" satisfies InputNameForAction<"getWebPageSummary">,
                      payload: { kind: "Text", value: webPageUrl },
                    },
                    ...actionDefinitions.getWebPageSummary.inputs.flatMap<StepInput>(
                      ({ name, default: defaultValue }) =>
                        !defaultValue || name === "url"
                          ? []
                          : [{ inputName: name, payload: defaultValue }],
                    ),
                  ],
                });

                if (response.code !== StatusCode.Ok) {
                  return `An unexpected error occurred trying to summarize the web page at url ${webPageUrl}.`;
                }

                const { outputs } = response.contents[0]!;

                const summaryOutput = outputs.find(
                  ({ outputName }) => outputName === "summary",
                );

                if (!summaryOutput) {
                  throw new Error(
                    `No summary output was found when calling "getSummariesOfWebPages" for the web page at url ${webPageUrl}.`,
                  );
                }

                const summary = summaryOutput.payload.value as string;

                logProgress([
                  {
                    recordedAt: new Date().toISOString(),
                    stepId: Context.current().info.activityId,
                    type: "VisitedWebPage",
                    webPage: {
                      url: webPageUrl,
                      title: outputs.find(
                        (output) =>
                          output.outputName ===
                          ("title" satisfies OutputNameForAction<"getWebPageSummary">),
                      )?.payload.value as string,
                    },
                    explanation,
                  },
                ]);

                return `Summary of the web page at url ${webPageUrl}: ${summary}`;
              }),
            );

            return {
              ...toolCall,
              output: summaries.join("\n"),
            };
          } else if (toolCall.name === "webSearch") {
            const { query, explanation } =
              toolCall.input as CoordinatorToolCallArguments["webSearch"];

            const response = await webSearchAction({
              inputs: [
                {
                  inputName: "query" satisfies InputNameForAction<"webSearch">,
                  payload: { kind: "Text", value: query },
                },
                {
                  inputName:
                    "numberOfSearchResults" satisfies InputNameForAction<"webSearch">,
                  payload: { kind: "Number", value: 3 },
                },
              ],
            });

            if (response.code !== StatusCode.Ok) {
              throw new Error(
                `Failed to perform web search: ${JSON.stringify(response)}`,
              );
            }

            logProgress([
              {
                type: "QueriedWeb",
                query,
                recordedAt: new Date().toISOString(),
                stepId: Context.current().info.activityId,
                explanation,
              },
            ]);

            const { outputs } = response.contents[0]!;

            return {
              ...toolCall,
              output: JSON.stringify(outputs),
            };
          } else if (toolCall.name === "inferFactsFromWebPage") {
            const {
              url,
              prompt: inferencePrompt,
              entityTypeIds,
              linkEntityTypeIds,
            } = toolCall.input as CoordinatorToolCallArguments["inferFactsFromWebPage"];

            const validEntityTypeIds = input.entityTypes.map(({ $id }) => $id);

            const invalidEntityTypeIds = entityTypeIds.filter(
              (entityTypeId) =>
                !validEntityTypeIds.includes(entityTypeId as VersionedUrl),
            );

            const validLinkEntityTypeIds =
              input.linkEntityTypes?.map(({ $id }) => $id) ?? [];

            const invalidLinkEntityTypeIds =
              linkEntityTypeIds?.filter(
                (entityTypeId) =>
                  !validLinkEntityTypeIds.includes(
                    entityTypeId as VersionedUrl,
                  ),
              ) ?? [];

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

                        Valid entity type IDs are: ${JSON.stringify(validEntityTypeIds)}
                      `)
                      : ""
                  }
                  ${
                    invalidLinkEntityTypeIds.length > 0
                      ? dedent(`
                        The following link entity type IDs are invalid: ${JSON.stringify(
                          invalidLinkEntityTypeIds,
                        )}

                        The valid link entity types type IDs are: ${JSON.stringify(linkEntityTypeIds)}
                      `)
                      : ""
                  }

                `),
                isError: true,
              };
            }

            const status = await inferFactsFromWebPageWorkerAgent({
              prompt: inferencePrompt,
              entityTypes: input.entityTypes.filter(({ $id }) =>
                entityTypeIds.includes($id),
              ),
              linkEntityTypes: input.linkEntityTypes?.filter(
                ({ $id }) => linkEntityTypeIds?.includes($id) ?? false,
              ),
              url,
            });

            if (status.code !== StatusCode.Ok) {
              return {
                ...toolCall,
                output: dedent(`
                  An error occurred when inferring facts from the web page with url ${url}: ${status.message}

                  Try another website.
                `),
                isError: true,
              };
            }

            const {
              inferredFacts,
              inferredFactsAboutEntities,
              filesUsedToInferFacts,
            } = status.contents[0]!;

            /**
             * @todo: deduplicate the entity summaries from existing entities provided as input.
             */

            if (inferredFactsAboutEntities.length > 0) {
              const { duplicates } = await deduplicateEntities({
                entities: [
                  ...(input.existingEntitySummaries ?? []),
                  ...inferredFactsAboutEntities,
                  ...state.inferredFactsAboutEntities,
                ],
              });

              const existingEntityIds = (
                input.existingEntitySummaries ?? []
              ).map(({ entityId }) => entityId);

              const adjustedDuplicates = duplicates.map<DuplicateReport>(
                ({ canonicalId, duplicateIds }) => {
                  if (existingEntityIds.includes(canonicalId as EntityId)) {
                    return { canonicalId, duplicateIds };
                  }

                  const existingEntityIdMarkedAsDuplicate = duplicateIds.find(
                    (id) => existingEntityIds.includes(id as EntityId),
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

              const inferredFactsWithDeduplicatedEntities = inferredFacts.map(
                (fact) => {
                  const { subjectEntityLocalId, objectEntityLocalId } = fact;
                  const subjectDuplicate = adjustedDuplicates.find(
                    ({ duplicateIds }) =>
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
                      subjectDuplicate?.canonicalId ??
                      fact.subjectEntityLocalId,
                    objectEntityLocalId:
                      objectDuplicate?.canonicalId ?? objectEntityLocalId,
                  };
                },
              );

              state.inferredFacts.push(
                ...inferredFactsWithDeduplicatedEntities,
              );
              state.inferredFactsAboutEntities = [
                ...state.inferredFactsAboutEntities,
                ...inferredFactsAboutEntities,
              ].filter(
                ({ localId }) =>
                  !duplicates.some(({ duplicateIds }) =>
                    duplicateIds.includes(localId),
                  ),
              );
              state.filesUsedToInferFacts.push(...filesUsedToInferFacts);

              return {
                ...toolCall,
                output: dedent(`
                ${inferredFacts.length} facts were successfully inferred for the following entities: ${JSON.stringify(inferredFactsAboutEntities)}
              `),
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

            const { proposedEntities } = await proposeEntitiesFromFacts({
              dereferencedEntityTypes: input.allDereferencedEntityTypesById,
              entitySummaries,
              existingEntitySummaries: input.existingEntitySummaries,
              facts: relevantFacts,
            });

            state.proposedEntities.push(...proposedEntities);

            return {
              ...toolCall,
              output: dedent(`
                ${proposedEntities.length} entities were successfully proposed.
              `),
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
        ...(submittedProposedEntity.provenance?.sources ?? []),
        ...(submittedProposedEntity.propertyMetadata?.flatMap(
          ({ metadata }) => metadata.provenance?.sources ?? [],
        ) ?? []),
      ];

      return sourcesUsedToProposeEntity.flatMap(({ location }) => {
        const { uri } = location ?? {};

        return (
          state.filesUsedToProposeEntities.find(({ url }) => url === uri) ?? []
        );
      });
    })
    .filter(
      ({ url }, index, all) =>
        all.findIndex((file) => file.url === url) === index,
    );

  const { flowEntityId, stepId } = await getFlowContext();

  const fileEditionProvenance: ProposedEntity["provenance"] = {
    actorType: "ai",
    // @ts-expect-error - `ProvidedEntityEditionProvenanceOrigin` is not being generated correctly from the Graph API
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
      propertyMetadata: [],
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
