import type { GraphApi } from "@local/hash-graph-client";
import type {
  InputNameForAction,
  OutputNameForAction,
} from "@local/hash-isomorphic-utils/flows/action-definitions";
import {
  actionDefinitions,
  getSimplifiedActionInputs,
} from "@local/hash-isomorphic-utils/flows/action-definitions";
import type {
  ProposedEntity,
  StepInput,
} from "@local/hash-isomorphic-utils/flows/types";
import { StatusCode } from "@local/status";
import dedent from "dedent";

import type { ParsedLlmToolCall } from "../shared/get-llm-response/types";
import { getWebPageSummaryAction } from "./get-web-page-summary-action";
import type {
  CoordinatorToolCallArguments,
  CoordinatorToolName,
} from "./research-entities-action/coordinator-tools";
import { inferEntitiesFromWebPageWorkerAgent } from "./research-entities-action/infer-entities-from-web-page-worker-agent";
import { coordinatingAgent } from "./research-entities-action/open-ai-coordinating-agent";
import type { CompletedToolCall } from "./research-entities-action/types";
import type { FlowActionActivity } from "./types";
import { webSearchAction } from "./web-search-action";

export const researchEntitiesAction: FlowActionActivity<{
  graphApiClient: GraphApi;
}> = async ({ inputs, userAuthentication, graphApiClient }) => {
  const { prompt, entityTypeIds } = getSimplifiedActionInputs({
    inputs,
    actionType: "researchEntities",
  });

  const proposedEntities: ProposedEntity[] = [];

  const submittedEntityIds: string[] = [];

  /**
   * We start by asking the coordinator agent to create an initial plan
   * for the research task.
   */
  const { plan: initialPlan } = await coordinatingAgent.createInitialPlan({
    prompt,
  });

  const { toolCalls: initialToolCalls } =
    await coordinatingAgent.getNextToolCalls({
      previousPlan: initialPlan,
      submittedProposedEntities: [],
      prompt,
    });

  const processToolCalls = async (params: {
    previousCalls?: {
      completedToolCalls: CompletedToolCall<CoordinatorToolName>[];
    }[];
    previousPlan: string;
    toolCalls: ParsedLlmToolCall<CoordinatorToolName>[];
  }) => {
    const { toolCalls, previousCalls } = params;

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
    let latestPlan = params.previousPlan;

    const completedToolCalls = await Promise.all(
      toolCallsWithRelevantResults.map(
        async (toolCall): Promise<CompletedToolCall<CoordinatorToolName>> => {
          if (toolCall.name === "updatePlan") {
            const { plan } =
              toolCall.input as CoordinatorToolCallArguments["updatePlan"];

            latestPlan = plan;

            return {
              ...toolCall,
              output: `The plan has been successfully updated.`,
            };
          } else if (toolCall.name === "submitProposedEntities") {
            const { entityIds } =
              toolCall.input as CoordinatorToolCallArguments["submitProposedEntities"];

            submittedEntityIds.push(...entityIds);

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
            const { url, prompt: inferencePrompt } =
              toolCall.input as CoordinatorToolCallArguments["inferEntitiesFromWebPage"];

            const status = await inferEntitiesFromWebPageWorkerAgent({
              prompt: inferencePrompt,
              entityTypeIds: entityTypeIds!,
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
              };
            }

            const { inferredEntities } = status.contents[0]!;

            proposedEntities.push(...inferredEntities);

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

    const updatedPreviousCalls = [
      ...(previousCalls ?? []),
      { completedToolCalls },
    ];

    const submittedProposedEntities = proposedEntities.filter(
      ({ localEntityId }) => submittedEntityIds.includes(localEntityId),
    );

    const { toolCalls: nextToolCalls } =
      await coordinatingAgent.getNextToolCalls({
        previousPlan: latestPlan,
        submittedProposedEntities,
        previousCalls: updatedPreviousCalls,
        prompt,
      });

    await processToolCalls({
      previousPlan: latestPlan,
      previousCalls: updatedPreviousCalls,
      toolCalls: nextToolCalls,
    });
  };

  await processToolCalls({
    previousPlan: initialPlan,
    toolCalls: initialToolCalls,
  });

  const submittedProposedEntities = proposedEntities.filter(
    ({ localEntityId }) => submittedEntityIds.includes(localEntityId),
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
