import type { VersionedUrl } from "@blockprotocol/type-system";
import type { GraphApi } from "@local/hash-graph-client";
import type {
  InputNameForAction,
  OutputNameForAction,
} from "@local/hash-isomorphic-utils/flows/action-definitions";
import { actionDefinitions } from "@local/hash-isomorphic-utils/flows/action-definitions";
import type { StepInput } from "@local/hash-isomorphic-utils/flows/types";
import { StatusCode } from "@local/status";
import dedent from "dedent";

import type { ParsedLlmToolCall } from "../shared/get-llm-response/types";
import { getWebPageSummaryAction } from "./get-web-page-summary-action";
import type {
  CoordinatorToolCallArguments,
  CoordinatorToolName,
} from "./research-entities-action/coordinator-tools";
import { inferEntitiesFromWebPageWorkerAgent } from "./research-entities-action/infer-entities-from-web-page-worker-agent";
import type { CoordinatingAgentState } from "./research-entities-action/open-ai-coordinating-agent";
import { coordinatingAgent } from "./research-entities-action/open-ai-coordinating-agent";
import type { CompletedToolCall } from "./research-entities-action/types";
import type { FlowActionActivity } from "./types";
import { webSearchAction } from "./web-search-action";

export const researchEntitiesAction: FlowActionActivity<{
  graphApiClient: GraphApi;
}> = async ({ inputs: stepInputs, userAuthentication, graphApiClient }) => {
  const input = await coordinatingAgent.parseCoordinatorInputs({
    stepInputs,
    userAuthentication,
    graphApiClient,
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
  };

  const { toolCalls: initialToolCalls } =
    await coordinatingAgent.getNextToolCalls({
      input,
      state,
    });

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
      ({ name }) => name !== "complete" && name !== "terminate",
    );

    /**
     * This plan may be updated by the tool calls that are about to be
     * evaluated.
     */

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
          } else if (toolCall.name === "submitProposedEntities") {
            const { entityIds } =
              toolCall.input as CoordinatorToolCallArguments["submitProposedEntities"];

            state.submittedEntityIds.push(...entityIds);

            return {
              ...toolCall,
              output: `The entities with IDs ${JSON.stringify(entityIds)} where successfully submitted.`,
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
              userAuthentication,
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
              userAuthentication,
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
              userAuthentication,
              graphApiClient,
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

            const { inferredEntities } = status.contents[0]!;

            state.proposedEntities.push(...inferredEntities);

            return {
              ...toolCall,
              output: JSON.stringify(inferredEntities),
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
      return;
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

  const submittedProposedEntities = state.proposedEntities.filter(
    ({ localEntityId }) => state.submittedEntityIds.includes(localEntityId),
  );

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
              value: submittedProposedEntities,
            },
          },
        ],
      },
    ],
  };
};
