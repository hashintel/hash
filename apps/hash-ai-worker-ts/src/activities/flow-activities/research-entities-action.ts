import type { VersionedUrl } from "@blockprotocol/type-system";
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
import type { ParsedLlmToolCall } from "../shared/get-llm-response/types";
import { logProgress } from "../shared/log-progress";
import { stringify } from "../shared/stringify";
import { getWebPageSummaryAction } from "./get-web-page-summary-action";
import type {
  CoordinatorToolCallArguments,
  CoordinatorToolName,
} from "./research-entities-action/coordinator-tools";
import { inferEntitiesFromWebPageWorkerAgent } from "./research-entities-action/infer-entities-from-web-page-worker-agent";
import type { CoordinatingAgentState } from "./research-entities-action/open-ai-coordinating-agent";
import { coordinatingAgent } from "./research-entities-action/open-ai-coordinating-agent";
import type { CompletedToolCall } from "./research-entities-action/types";
import { getAnswersFromHuman } from "./shared/get-answers-from-human";
import type { FlowActionActivity } from "./types";
import { webSearchAction } from "./web-search-action";

export const researchEntitiesAction: FlowActionActivity = async ({
  inputs: stepInputs,
}) => {
  const input = await coordinatingAgent.parseCoordinatorInputs({
    stepInputs,
  });

  /**
   * We start by asking the coordinator agent to create an initial plan
   * for the research task.
   */
  const { plan: initialPlan } = await coordinatingAgent.createInitialPlan({
    input,
  });

  const state: CoordinatingAgentState = {
    plan: initialPlan,
    proposedEntities: [],
    submittedEntityIds: [],
    previousCalls: [],
    hasConductedCheckStep: false,
    filesUsedToProposeEntities: [],
  };

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
            const response = await getAnswersFromHuman(
              (
                toolCall.input as CoordinatorToolCallArguments["requestHumanInput"]
              ).questions,
            );

            return {
              ...toolCall,
              output: response,
            };
          } else if (toolCall.name === "submitProposedEntities") {
            const { entityIds } =
              toolCall.input as CoordinatorToolCallArguments["submitProposedEntities"];

            state.submittedEntityIds.push(...entityIds);

            return {
              ...toolCall,
              output: `The entities with IDs ${JSON.stringify(entityIds)} were successfully submitted.`,
            };
          } else if (toolCall.name === "getWebPageSummary") {
            const { url } =
              toolCall.input as CoordinatorToolCallArguments["getWebPageSummary"];

            const response = await getWebPageSummaryAction({
              inputs: [
                {
                  inputName:
                    "url" satisfies InputNameForAction<"getWebPageSummary">,
                  payload: { kind: "Text", value: url },
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
              return {
                ...toolCall,
                output: `An unexpected error occurred trying to summarize the web page at url ${url}, try a different web page.`,
                isError: true,
              };
            }

            const { outputs } = response.contents[0]!;

            return {
              ...toolCall,
              output: JSON.stringify(outputs),
            };
          } else if (toolCall.name === "webSearch") {
            const { query } =
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

            const { outputs } = response.contents[0]!;

            return {
              ...toolCall,
              output: JSON.stringify(outputs),
            };
          } else if (toolCall.name === "inferEntitiesFromWebPage") {
            const {
              url,
              prompt: inferencePrompt,
              entityTypeIds,
              linkEntityTypeIds,
            } = toolCall.input as CoordinatorToolCallArguments["inferEntitiesFromWebPage"];

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

            const status = await inferEntitiesFromWebPageWorkerAgent({
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
                  An error occurred when inferring entities from the web
                    page with url ${url}: ${status.message}
                  
                  Try another website.
                `),
                isError: true,
              };
            }

            const { inferredEntities, filesUsedToProposeEntities } =
              status.contents[0]!;

            state.proposedEntities.push(...inferredEntities);
            state.filesUsedToProposeEntities.push(
              ...filesUsedToProposeEntities,
            );

            return {
              ...toolCall,
              output: JSON.stringify(inferredEntities),
            };
          } else if (toolCall.name === "proposeAndSubmitLink") {
            const { sourceEntityId, targetEntityId, linkEntityTypeId } =
              toolCall.input as CoordinatorToolCallArguments["proposeAndSubmitLink"];

            const sourceEntity =
              input.existingEntities?.find(
                ({ metadata }) => metadata.recordId.entityId === sourceEntityId,
              ) ??
              state.proposedEntities.find(
                ({ localEntityId }) => localEntityId === sourceEntityId,
              );

            const targetEntity =
              input.existingEntities?.find(
                ({ metadata }) => metadata.recordId.entityId === targetEntityId,
              ) ??
              state.proposedEntities.find(
                ({ localEntityId }) => localEntityId === targetEntityId,
              );

            if (!sourceEntity || !targetEntity) {
              return {
                ...toolCall,
                output: dedent(`
                  There is no ${input.existingEntities ? "existing or " : ""} proposed entity with ID "${sourceEntityId}".
                  
                  ${input.existingEntities ? `Possible existing entity IDs are: ${JSON.stringify(input.existingEntities.map(({ metadata }) => metadata.recordId.entityId))}.` : ""}
                  Possible proposed entity IDs are: ${JSON.stringify(state.proposedEntities.map(({ localEntityId }) => localEntityId))}.
                `),
                isError: true,
              };
            }

            const validLinkEntityTypeIds =
              input.linkEntityTypes?.map(({ $id }) => $id) ?? [];

            if (
              !validLinkEntityTypeIds.includes(linkEntityTypeId as VersionedUrl)
            ) {
              return {
                ...toolCall,
                output: dedent(`
                  The link entity type ID "${linkEntityTypeId}" is invalid.
                  
                  Valid link entity type IDs are: ${JSON.stringify(validLinkEntityTypeIds)}.
                `),
                isError: true,
              };
            }

            /** @todo: improve generation of local entity id */
            const localEntityId = `${linkEntityTypeId}-${state.proposedEntities.length}`;

            state.proposedEntities.push({
              localEntityId,
              entityTypeId: linkEntityTypeId as VersionedUrl,
              sourceEntityId:
                "metadata" in sourceEntity
                  ? {
                      kind: "existing-entity",
                      entityId: sourceEntity.metadata.recordId.entityId,
                    }
                  : {
                      kind: "proposed-entity",
                      localId: sourceEntity.localEntityId,
                    },
              targetEntityId:
                "metadata" in targetEntity
                  ? {
                      kind: "existing-entity",
                      entityId: targetEntity.metadata.recordId.entityId,
                    }
                  : {
                      kind: "proposed-entity",
                      localId: targetEntity.localEntityId,
                    },
              /**
               * @todo: allow the agent to specify link properties.
               */
              properties: {},
            });

            state.submittedEntityIds.push(localEntityId);

            let submittedSourceProposedEntityId: string | undefined;

            if (
              "localEntityId" in sourceEntity &&
              !state.submittedEntityIds.includes(sourceEntity.localEntityId)
            ) {
              state.submittedEntityIds.push(sourceEntity.localEntityId);
              submittedSourceProposedEntityId = sourceEntity.localEntityId;
            }

            let submittedTargetProposedEntityId: string | undefined;
            if (
              "localEntityId" in targetEntity &&
              !state.submittedEntityIds.includes(targetEntity.localEntityId)
            ) {
              state.submittedEntityIds.push(targetEntity.localEntityId);
              submittedTargetProposedEntityId = targetEntity.localEntityId;
            }

            return {
              ...toolCall,
              output: dedent(`
                The link between the entities with IDs ${sourceEntityId} and ${targetEntityId} has been successfully proposed and submitted.
                ${submittedSourceProposedEntityId ? `The source proposed entity with ID ${sourceEntityId} has also been submitted.` : ""}
                ${submittedTargetProposedEntityId ? `The target proposed entity with ID ${targetEntityId} has also been submitted.` : ""}
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

                    You can propose links using the "proposeAndSubmitLink" tool, or infer links
                      from the text of a web page with the "inferEntitiesFromWebPage" tool.
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

  /**
   * We return additional proposed entities for each file that was used to propose
   * the submitted entities, so that these are persisted in the graph.
   *
   * Note that uploading the file is handled in the "Persist Entity" action.
   */
  const fileEntityProposals: ProposedEntity[] =
    filesUsedToProposeSubmittedEntities.map(({ url, entityTypeId }) => ({
      /**
       * @todo: set the web page this file was discovered in (if applicable) in the property provenance
       * for the `fileUrl`
       */
      propertyMetadata: [],
      entityTypeId,
      localEntityId: generateUuid(),
      properties: {
        "https://blockprotocol.org/@blockprotocol/types/property-type/file-url/":
          url,
      } satisfies FileProperties,
    }));

  const now = new Date().toISOString();
  const stepId = Context.current().info.activityId;

  logProgress(
    fileEntityProposals.map((proposedFileEntity) => ({
      type: "ProposedEntity",
      proposedEntity: proposedFileEntity,
      recordedAt: now,
      stepId,
    })),
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
