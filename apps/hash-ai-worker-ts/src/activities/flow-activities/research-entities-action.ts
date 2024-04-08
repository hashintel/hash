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

import { getWebPageActivity } from "../get-web-page-activity";
import { getWebPageSummaryAction } from "./get-web-page-summary-action";
import { inferEntitiesFromContentAction } from "./infer-entities-from-content-action";
import type {
  CoordinatorToolCallArguments,
  CoordinatorToolId,
} from "./research-entities-action/coordinator-tools";
import { coordinatingAgent } from "./research-entities-action/open-ai-coordinating-agent";
import type {
  CompletedToolCall,
  ProposedEntityWithLocalId,
  ToolCall,
} from "./research-entities-action/types";
import type { FlowActionActivity } from "./types";
import { webSearchAction } from "./web-search-action";

export const researchEntitiesAction: FlowActionActivity<{
  graphApiClient: GraphApi;
}> = async ({ inputs, userAuthentication, graphApiClient }) => {
  const { prompt, entityTypeIds } = getSimplifiedActionInputs({
    inputs,
    actionType: "researchEntities",
  });

  const proposedEntities: ProposedEntityWithLocalId[] = [];

  const submittedEntityIds: string[] = [];

  let counter = 0;

  const generateLocalId = (): string => {
    counter += 1;
    return counter.toString();
  };

  /**
   * We start by making a asking the coordinator agent to create an initial plan
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
      completedToolCalls: CompletedToolCall<CoordinatorToolId>[];
    }[];
    previousPlan: string;
    toolCalls: ToolCall<CoordinatorToolId>[];
  }) => {
    const { toolCalls, previousCalls } = params;

    const isTerminated = toolCalls.some(
      (toolCall) => toolCall.toolId === "terminate",
    );

    if (isTerminated) {
      return;
    }

    const toolCallsWithRelevantResults = toolCalls.filter(
      ({ toolId }) => toolId !== "complete" && toolId !== "terminate",
    );

    /**
     * This plan may be updated by the tool calls that are about to be
     * evaluated.
     */
    let latestPlan = params.previousPlan;

    const completedToolCalls = await Promise.all(
      toolCallsWithRelevantResults.map(
        async (toolCall): Promise<CompletedToolCall<CoordinatorToolId>> => {
          if (toolCall.toolId === "updatePlan") {
            const { plan } =
              toolCall.parsedArguments as CoordinatorToolCallArguments["updatePlan"];

            latestPlan = plan;
          } else if (toolCall.toolId === "submitProposedEntities") {
            const { entityIds } =
              toolCall.parsedArguments as CoordinatorToolCallArguments["submitProposedEntities"];

            submittedEntityIds.push(...entityIds);

            return {
              ...toolCall,
              output: `The entities with IDs ${JSON.stringify(entityIds)} where successfully submitted.`,
            };
          } else if (toolCall.toolId === "getWebPageSummary") {
            const { url } =
              toolCall.parsedArguments as CoordinatorToolCallArguments["getWebPageSummary"];

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
                output: `An unexpected error ocurred trying to summarize the web page at url ${url}, try a different web page.`,
              };
            }

            const { outputs } = response.contents[0]!;

            return {
              ...toolCall,
              output: JSON.stringify(outputs),
            };
          } else if (toolCall.toolId === "webSearch") {
            const { query } =
              toolCall.parsedArguments as CoordinatorToolCallArguments["webSearch"];

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
          } else if (toolCall.toolId === "inferEntitiesFromWebPage") {
            const { url, prompt: inferencePrompt } =
              toolCall.parsedArguments as CoordinatorToolCallArguments["inferEntitiesFromWebPage"];

            const webPage = await getWebPageActivity({ url }).catch(
              () => undefined,
            );

            if (!webPage) {
              return {
                ...toolCall,
                output: `There was an error fetching the web page at ${url}, try another website.`,
              };
            }

            const response = await inferEntitiesFromContentAction({
              inputs: [
                {
                  inputName:
                    "content" satisfies InputNameForAction<"inferEntitiesFromContent">,
                  payload: { kind: "WebPage", value: webPage },
                },
                {
                  inputName:
                    "entityTypeIds" satisfies InputNameForAction<"inferEntitiesFromContent">,
                  payload: {
                    kind: "VersionedUrl",
                    value: entityTypeIds!,
                  },
                },
                {
                  inputName:
                    "relevantEntitiesPrompt" satisfies InputNameForAction<"inferEntitiesFromContent">,
                  payload: { kind: "Text", value: inferencePrompt },
                },
                ...actionDefinitions.inferEntitiesFromContent.inputs.flatMap<StepInput>(
                  ({ name, default: defaultValue }) =>
                    defaultValue
                      ? [{ inputName: name, payload: defaultValue }]
                      : [],
                ),
              ],
              userAuthentication,
              graphApiClient,
            });

            if (response.code !== StatusCode.Ok) {
              return {
                ...toolCall,
                output: `An unexpected error ocurred inferring entities from the web page with url ${url}, try another website.`,
              };
            }

            const { outputs } = response.contents[0]!;

            const newProposedEntities = outputs.find(
              ({ outputName }) =>
                outputName ===
                ("proposedEntities" satisfies OutputNameForAction<"inferEntitiesFromContent">),
            )?.payload.value as ProposedEntity[];

            const newProposedEntitiesWithIds = newProposedEntities.map(
              (proposedEntity) => ({
                ...proposedEntity,
                localId: generateLocalId(),
              }),
            );

            proposedEntities.push(...newProposedEntitiesWithIds);

            return {
              ...toolCall,
              output: JSON.stringify(newProposedEntitiesWithIds),
            };
          }

          throw new Error(`Unimplemented tool call: ${toolCall.toolId}`);
        },
      ),
    );

    const isCompleted = toolCalls.some(
      (toolCall) => toolCall.toolId === "complete",
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

    const submittedProposedEntities = proposedEntities.filter(({ localId }) =>
      submittedEntityIds.includes(localId),
    );

    const openAiResponse = await coordinatingAgent.getNextToolCalls({
      previousPlan: latestPlan,
      submittedProposedEntities,
      previousCalls: updatedPreviousCalls,
      prompt,
    });

    await processToolCalls({
      previousPlan: latestPlan,
      previousCalls: updatedPreviousCalls,
      toolCalls: openAiResponse.toolCalls,
    });
  };

  await processToolCalls({
    previousPlan: initialPlan,
    toolCalls: initialToolCalls,
  });

  const submittedProposedEntities = proposedEntities.filter(({ localId }) =>
    submittedEntityIds.includes(localId),
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
              value: submittedProposedEntities.map(
                ({ localId: _localId, ...rest }) => rest,
              ),
            },
          },
        ],
      },
    ],
  };
};
