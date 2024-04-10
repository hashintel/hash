import type { VersionedUrl } from "@blockprotocol/type-system";
import type { GraphApi } from "@local/hash-graph-client";
import type {
  InputNameForAction,
  OutputNameForAction,
} from "@local/hash-isomorphic-utils/flows/action-definitions";
import { actionDefinitions } from "@local/hash-isomorphic-utils/flows/action-definitions";
import type {
  ProposedEntity,
  StepInput,
} from "@local/hash-isomorphic-utils/flows/types";
import type { AccountId } from "@local/hash-subgraph/.";
import type { Status } from "@local/status";
import { StatusCode } from "@local/status";
import dedent from "dedent";
import type {
  ChatCompletionCreateParams,
  ChatCompletionMessageParam,
  ChatCompletionSystemMessageParam,
} from "openai/resources";

import { getDereferencedEntityTypesActivity } from "../../get-dereferenced-entity-types-activity";
// import { getWebPageActivity } from "../../get-web-page-activity";
import type {
  DereferencedEntityTypesByTypeId,
  PermittedOpenAiModel,
} from "../../infer-entities/inference-types";
import { getOpenAiResponse } from "../../infer-entities/shared/get-open-ai-response";
import { inferEntitiesFromContentAction } from "../infer-entities-from-content-action";
import { getWebPageInnerHtml } from "./infer-entities-from-web-page-worker-agent/get-web-page-inner-html";
import type {
  InferEntitiesFromWebPageWorkerAgentState,
  ToolId,
} from "./infer-entities-from-web-page-worker-agent/types";
import { isToolId } from "./infer-entities-from-web-page-worker-agent/types";
// import { writeStateToFile } from "./testing-utils";
import type {
  CompletedToolCall,
  ProposedEntityWithLocalId,
  ToolCall,
  ToolDefinition,
} from "./types";
import {
  mapPreviousCallsToChatCompletionMessages,
  mapToolDefinitionToOpenAiTool,
  parseOpenAiFunctionArguments,
} from "./util";

const model: PermittedOpenAiModel = "gpt-4-0125-preview";

type SummarizedEntity = {
  id: string;
  entityTypeId: VersionedUrl;
  summary: string;
};

const mapProposedEntityWithLocalIdToSummarizedEntity = (
  entity: ProposedEntityWithLocalId,
): SummarizedEntity => {
  if (!entity.summary) {
    throw new Error("Expected proposed entity to have a summary.");
  }
  return {
    id: entity.localId,
    entityTypeId: entity.entityTypeId,
    summary: entity.summary ?? "",
  };
};

const explanationDefinition = {
  type: "string",
  description:
    "An explanation of why this tool call is required to satisfy the task, and how it aligns with the current plan. If the plan needs to be modified",
} as const;

const toolDefinitions: Record<ToolId, ToolDefinition<ToolId>> = {
  // getWebPageInnerText: {
  //   toolId: "getWebPageInnerText",
  //   description: "Get the inner text (i.e. the rendered text) of a web page.",
  //   inputSchema: {
  //     type: "object",
  //     properties: {
  //       explanation: explanationDefinition,
  //       url: {
  //         type: "string",
  //         description: "The URL of the web page.",
  //       },
  //     },
  //     required: ["url", "explanation"],
  //   },
  // },
  getWebPageInnerHtml: {
    toolId: "getWebPageInnerHtml",
    description: "Get the inner HTML of a web page.",
    inputSchema: {
      type: "object",
      properties: {
        explanation: explanationDefinition,
        url: {
          type: "string",
          description: "The URL of the web page.",
        },
      },
      required: ["url", "explanation"],
    },
  },
  inferEntitiesFromWebPage: {
    toolId: "inferEntitiesFromWebPage",
    description: "Infer entities from some text content.",
    inputSchema: {
      type: "object",
      properties: {
        explanation: explanationDefinition,
        url: {
          type: "string",
          description: "The URL of the web page.",
        },
        text: {
          type: "string",
          description: dedent(`
            The relevant text from the web page from which to infer entities.

            Provide the entire text necessary to accurately infer properties of the
            relevant entities in a single tool call.
            
            Do not truncate or provide partial text which may lead to missed entities
              or properties.
        
            If additional context (e.g. the current date) is needed to fully infer the
            entities, ensure it is incorporated in the provided text. The current is ${new Date().toISOString()}.
            `),
        },
        prompt: {
          type: "string",
          description: dedent(`
            A prompt instructing the inference agent which entities should be inferred from the text.
            Do not specify any information of the structure of the entities, as this is predefined by
              the entity type.
          `),
        },
        entityTypeIds: {
          type: "array",
          items: {
            type: "string",
          },
          description: dedent(`
            An array of entity type IDs which should be inferred from the provided text.
          `),
        },
      },
      required: ["url", "text", "prompt", "explanation", "entityTypeIds"],
    },
  },
  submitProposedEntities: {
    toolId: "submitProposedEntities",
    description:
      "Submit one or more proposed entities as the `result` of the inference task.",
    inputSchema: {
      type: "object",
      properties: {
        explanation: explanationDefinition,
        entityIds: {
          type: "array",
          items: {
            type: "string",
          },
          description: dedent(`
            An array of entity IDs of the entities to submit.
            These must correspond to the IDs provided by a "inferEntitiesFromWebPage" tool call.
          `),
        },
      },
      required: ["entityIds", "explanation"],
    },
  },
  complete: {
    toolId: "complete",
    description:
      "Complete the inference task. You must explain how the task has been completed with the existing submitted entities. Do not make this tool call if the research prompt hasn't been fully satisfied.",
    inputSchema: {
      type: "object",
      properties: {
        explanation: explanationDefinition,
      },
      required: ["explanation"],
    },
  },
  terminate: {
    toolId: "terminate",
    description:
      "Terminate the inference task, because it cannot be completed with the provided tools.",
    inputSchema: {
      type: "object",
      properties: {
        explanation: explanationDefinition,
      },
      required: ["explanation"],
    },
  },
  updatePlan: {
    toolId: "updatePlan",
    description:
      "Update the plan for the research task. You should call this alongside other tool calls to progress towards completing the task.",
    inputSchema: {
      type: "object",
      properties: {
        explanation: explanationDefinition,
        plan: {
          type: "string",
          description: "The updated plan for the research task.",
        },
      },
      required: ["plan", "explanation"],
    },
  },
};

type ToolCallArguments = {
  getWebPageInnerText: {
    url: string;
  };
  getWebPageInnerHtml: {
    url: string;
  };
  inferEntitiesFromWebPage: {
    url: string;
    text: string;
    prompt: string;
    entityTypeIds: VersionedUrl[];
  };
  submitProposedEntities: {
    entityIds: string[];
  };
  updatePlan: {
    plan: string;
  };
};

const systemMessagePrefix = dedent(`
  You are an infer entities from web page worker agent, with the goal
    of inferring specific entities from a web page or pages linked to by
    the web page.

  You are provided by the user with:
    - Prompt: the prompt you need to satisfy to complete the research task
    - Initial web page url: the url of the initial web page you should use to infer entities
    - Entity Types: a list of entity types which define the structure of the entities
      that can be inferred by the "inferEntitiesFromWebPage" tool.

    You will be provided with a variety of tools to complete the task.

  To fully satisfy the prompt, you may need to use the tools to navigate
    to linked pages, and evaluate them as well as the initial page that
    is provided.

  This is particularly important if the contents of a page are paginated
    over multiple web pages (for example web pages containing a table).

  Make as many different tool calls in parallel as possible. For example, call "inferEntitiesFromWebPage"
    alongside "getWebPageInnerHtml" to get the content of another web page which may contain
    more entities. Do not make more than one "getWebPageInnerHtml" tool call at a time.

  Do not under any circumstances make a tool call to a tool which you haven't
    been provided with.
`);

const generateUserMessage = (params: {
  prompt: string;
  url: string;
  dereferencedEntityTypes: DereferencedEntityTypesByTypeId;
  innerHtml?: string;
}): ChatCompletionMessageParam => {
  const { prompt, url, innerHtml, dereferencedEntityTypes } = params;

  return {
    role: "user",
    content: dedent(`
      Prompt: ${prompt}
      Initial web page url: ${url}
      ${innerHtml ? `Initial web page inner HTML: ${innerHtml}` : ""}
      Entity Types: ${JSON.stringify(dereferencedEntityTypes)}
    `),
  };
};

const createInitialPlan = async (params: {
  prompt: string;
  url: string;
  dereferencedEntityTypes: DereferencedEntityTypesByTypeId;
  innerHtml: string;
}): Promise<{ plan: string }> => {
  const { prompt, url, dereferencedEntityTypes } = params;

  const systemMessage: ChatCompletionSystemMessageParam = {
    role: "system",
    content: dedent(`
      ${systemMessagePrefix}

      Do not make *any* tool calls. You must first provide a plan of how you will use
        the tools to progress towards completing the task.

      This should be a list of steps in plain English.

      Remember that you may need to navigate to other web pages which are linked on the
      initial web page, to find all the entities required to satisfy the prompt.
    `),
  };

  const messages: ChatCompletionMessageParam[] = [
    systemMessage,
    generateUserMessage({ prompt, url, dereferencedEntityTypes }),
  ];

  const openApiPayload: ChatCompletionCreateParams = {
    messages,
    model,
    tools: Object.values(toolDefinitions).map(mapToolDefinitionToOpenAiTool),
  };

  const openAiResponse = await getOpenAiResponse(openApiPayload);

  if (openAiResponse.code !== StatusCode.Ok) {
    throw new Error(
      `Failed to get OpenAI response: ${JSON.stringify(openAiResponse)}`,
    );
  }

  const { response, usage: _usage } = openAiResponse.contents[0]!;

  /** @todo: capture usage */

  const openAiAssistantMessageContent = response.message.content;

  if (!openAiAssistantMessageContent) {
    throw new Error(
      `Expected message content in response: ${JSON.stringify(response, null, 2)}`,
    );
  }

  return {
    plan: openAiAssistantMessageContent,
  };
};

const getSubmittedProposedEntitiesFromState = (
  state: InferEntitiesFromWebPageWorkerAgentState,
): ProposedEntityWithLocalId[] =>
  state.proposedEntities.filter(({ localId }) =>
    state.submittedEntityIds.includes(localId),
  );

const retryLimit = 3;

const getNextToolCalls = async (params: {
  state: InferEntitiesFromWebPageWorkerAgentState;
  prompt: string;
  url: string;
  dereferencedEntityTypes: DereferencedEntityTypesByTypeId;
  retryMessages?: ChatCompletionMessageParam[];
  retryCount?: number;
}): Promise<{ toolCalls: ToolCall<ToolId>[] }> => {
  const {
    prompt,
    url,
    state,
    retryMessages,
    retryCount,
    dereferencedEntityTypes,
  } = params;

  const submittedProposedEntities =
    getSubmittedProposedEntitiesFromState(state);

  const systemMessage: ChatCompletionSystemMessageParam = {
    role: "system",
    content: dedent(`
      ${systemMessagePrefix}

      You have previously proposed the following plan:
      ${state.currentPlan}
      
      If you want to deviate from this plan, update it using the "updatePlan" tool.
      You must call the "updatePlan" tool alongside other tool calls to progress towards completing the task.

      To constrain the size of the chat, some message outputs may have been omitted. Here's a summary of what you've previously done:
      You have previously inferred entities from the following webpages: ${JSON.stringify(state.inferredEntitiesFromWebPageUrls, null, 2)}
      ${
        submittedProposedEntities.length > 0
          ? dedent(`
            You have previously submitted the following proposed entities:
            ${JSON.stringify(submittedProposedEntities.map(mapProposedEntityWithLocalIdToSummarizedEntity))}

            If the submitted entities satisfy the research prompt, call the "complete" tool.
          `)
          : "You have not previously submitted any proposed entities."
      }
    `),
  };

  const messages: ChatCompletionMessageParam[] = [
    systemMessage,
    generateUserMessage({ prompt, url, dereferencedEntityTypes }),
    ...mapPreviousCallsToChatCompletionMessages({
      previousCalls: state.previousCalls,
    }),
    ...(retryMessages ?? []),
  ];

  const openApiPayload: ChatCompletionCreateParams = {
    messages,
    model,
    tools: Object.values(toolDefinitions).map(mapToolDefinitionToOpenAiTool),
  };

  const openAiResponse = await getOpenAiResponse(openApiPayload);

  if (openAiResponse.code !== StatusCode.Ok) {
    throw new Error(
      `Failed to get OpenAI response: ${JSON.stringify(openAiResponse)}`,
    );
  }

  const { response, usage: _usage } = openAiResponse.contents[0]!;

  /** @todo: capture usage */

  const openAiToolCalls = response.message.tool_calls;

  const retryWithMessage = async (message: string) => {
    if (retryCount && retryCount > retryLimit) {
      throw new Error(`Failed to process OpenAi response: ${message}`);
    }

    return getNextToolCalls({
      ...params,
      retryMessages: [
        response.message,
        {
          role: "user" as const,
          content: message,
        },
      ],
      retryCount: (params.retryCount ?? 0) + 1,
    });
  };

  if (!openAiToolCalls) {
    return retryWithMessage(
      "You didn't provide any tool calls. You must make at least one.",
    );
  }

  const unexpectedToolCalls = openAiToolCalls.filter(
    (openAiToolCall) => !isToolId(openAiToolCall.function.name),
  );

  if (unexpectedToolCalls.length > 0) {
    return retryWithMessage(
      dedent(`
        You made the following unexpected tool calls: ${JSON.stringify(
          unexpectedToolCalls,
          null,
          2,
        )}

        You must only make tool calls to the tools provided to you.
      `),
    );
  }

  const toolCalls = openAiToolCalls.map<ToolCall<ToolId>>((openAiToolCall) => {
    if (isToolId(openAiToolCall.function.name)) {
      return {
        toolId: openAiToolCall.function.name,
        openAiToolCall,
        parsedArguments: parseOpenAiFunctionArguments({
          stringifiedArguments: openAiToolCall.function.arguments,
        }),
      };
    }

    throw new Error(`Unexpected tool call: ${openAiToolCall.function.name}`);
  });

  return { toolCalls };
};

export const inferEntitiesFromWebPageWorkerAgent = async (params: {
  prompt: string;
  entityTypeIds: VersionedUrl[];
  url: string;
  userAuthentication: { actorId: AccountId };
  graphApiClient: GraphApi;
}): Promise<
  Status<{
    inferredEntities: ProposedEntity[];
  }>
> => {
  const { prompt, url, entityTypeIds, userAuthentication, graphApiClient } =
    params;

  /**
   * We start by making a asking the coordinator agent to create an initial plan
   * for the research task. We include the inner HTML for the web page in this
   * call, to help it formulate a better initial plan.
   */
  const { innerHtml: initialWebPageInnerHtml } = await getWebPageInnerHtml({
    url,
    sanitizeForLlm: true,
  });

  const dereferencedEntityTypes = await getDereferencedEntityTypesActivity({
    entityTypeIds,
    graphApiClient,
    actorId: userAuthentication.actorId,
  });

  const { plan: initialPlan } = await createInitialPlan({
    prompt,
    url,
    innerHtml: initialWebPageInnerHtml,
    dereferencedEntityTypes,
  });

  const state: InferEntitiesFromWebPageWorkerAgentState = {
    currentPlan: initialPlan,
    previousCalls: [],
    proposedEntities: [],
    submittedEntityIds: [],
    inferredEntitiesFromWebPageUrls: [],
    idCounter: 0,
  };

  // const state = retrievePreviousState();

  const generateLocalId = (): string => {
    state.idCounter += 1;

    return state.idCounter.toString();
  };

  const { toolCalls: initialToolCalls } = await getNextToolCalls({
    state,
    prompt,
    url,
    dereferencedEntityTypes,
  });

  const processToolCalls = async (processToolCallsParams: {
    toolCalls: ToolCall<ToolId>[];
  }): Promise<Status<never>> => {
    const { toolCalls } = processToolCallsParams;

    const terminatedToolCall = toolCalls.find(
      (toolCall) => toolCall.toolId === "terminate",
    );

    if (terminatedToolCall) {
      return {
        code: StatusCode.Aborted,
        message: "The task was terminated by the worker agent.",
        contents: [],
      };
    }

    const toolCallsWithRelevantResults = toolCalls.filter(
      ({ toolId }) => toolId !== "complete" && toolId !== "terminate",
    );

    const completedToolCalls = await Promise.all(
      toolCallsWithRelevantResults.map(
        async (toolCall): Promise<CompletedToolCall<ToolId>> => {
          if (toolCall.toolId === "updatePlan") {
            const { plan } =
              toolCall.parsedArguments as ToolCallArguments["updatePlan"];

            state.currentPlan = plan;

            return {
              ...toolCall,
              output: `The plan has been successfully updated.`,
            };
          } else if (toolCall.toolId === "getWebPageInnerHtml") {
            const { url: toolCallUrl } =
              toolCall.parsedArguments as ToolCallArguments["getWebPageInnerHtml"];

            const { innerHtml } = await getWebPageInnerHtml({
              url: toolCallUrl,
              sanitizeForLlm: true,
            });

            state.previousCalls = state.previousCalls.map((previousCall) => ({
              ...previousCall,
              completedToolCalls: previousCall.completedToolCalls.map(
                (completedToolCall) => {
                  if (completedToolCall.toolId === "getWebPageInnerHtml") {
                    return {
                      ...completedToolCall,
                      redactedOutputMessage: dedent(`
                        The inner HTML of the web page with URL ${(JSON.parse(completedToolCall.openAiToolCall.function.arguments) as ToolCallArguments["getWebPageInnerHtml"]).url} has been redacted to reduce the length of this chat.
                        If you want to see the inner HTML of this page, call the "getWebPageInnerHtml" tool again.
                      `),
                    };
                  }

                  return completedToolCall;
                },
              ),
            }));

            return {
              ...toolCall,
              output: dedent(`
              ---------------- START OF INNER HTML ----------------
              ${innerHtml}
              ---------------- END OF INNER HTML ----------------
              If there are any entities in this HTML which you think are relevant to the task, you must
                immediately call the "inferEntitiesFromWebPage" tool with the relevant text from the HTML.
              
              If there are any links in the HTML which may also contain relevant entities, you should
                make additional "getWebPageInnerHtml" tool calls to get the content of those pages.

              Note that you will only be able to see one HTML page at a time, so do not make a single "getWebPageInnerHtml"
                tool call unless there are no entities to infer from this page.
              `),
            };

            // } else if (toolCall.toolId === "getWebPageInnerText") {
            //   const { url: toolCallUrl } =
            //     toolCall.parsedArguments as ToolCallArguments["getWebPageInnerText"];

            //   const { textContent } = await getWebPageActivity({
            //     url: toolCallUrl,
            //   });

            //   return {
            //     ...toolCall,
            //     output: textContent,
            //   };
          } else if (toolCall.toolId === "inferEntitiesFromWebPage") {
            const {
              text,
              prompt: toolCallPrompt,
              url: inferringEntitiesFromWebPageUrl,
              entityTypeIds: inferringEntitiesOfTypeIds,
            } = toolCall.parsedArguments as ToolCallArguments["inferEntitiesFromWebPage"];

            const invalidEntityTypeIds = inferringEntitiesOfTypeIds.filter(
              (entityTypeId) =>
                !entityTypeIds.some(
                  (expectedEntityTypeId) =>
                    expectedEntityTypeId === entityTypeId,
                ),
            );

            if (invalidEntityTypeIds.length > 0) {
              return {
                ...toolCall,
                output: dedent(`
                  You provided invalid entity type IDs which don't correspond to the entity types
                  which were initially provided: ${JSON.stringify(invalidEntityTypeIds)}

                  The possible entity types you can submit are: ${JSON.stringify(
                    entityTypeIds,
                  )}
                `),
              };
            }

            if (text.length === 0) {
              return {
                ...toolCall,
                output: dedent(`
                  You provided an empty string as the text from the web page. You must provide
                  the relevant text from the web page to infer entities.
                `),
              };
            }

            state.inferredEntitiesFromWebPageUrls.push(
              inferringEntitiesFromWebPageUrl,
            );

            const response = await inferEntitiesFromContentAction({
              inputs: [
                {
                  inputName:
                    "content" satisfies InputNameForAction<"inferEntitiesFromContent">,
                  payload: { kind: "Text", value: text },
                },
                {
                  inputName:
                    "entityTypeIds" satisfies InputNameForAction<"inferEntitiesFromContent">,
                  payload: {
                    kind: "VersionedUrl",
                    value: inferringEntitiesOfTypeIds,
                  },
                },
                {
                  inputName:
                    "relevantEntitiesPrompt" satisfies InputNameForAction<"inferEntitiesFromContent">,
                  payload: { kind: "Text", value: toolCallPrompt },
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

            state.proposedEntities.push(...newProposedEntitiesWithIds);

            return {
              ...toolCall,
              output: JSON.stringify(
                newProposedEntitiesWithIds.map(
                  mapProposedEntityWithLocalIdToSummarizedEntity,
                ),
              ),
            };
          } else if (toolCall.toolId === "submitProposedEntities") {
            const { entityIds } =
              toolCall.parsedArguments as ToolCallArguments["submitProposedEntities"];

            const invalidEntityIds = entityIds.filter(
              (entityId) =>
                !state.proposedEntities.some(
                  ({ localId }) => localId === entityId,
                ),
            );

            if (invalidEntityIds.length > 0) {
              return {
                ...toolCall,
                output: dedent(`
                  You provided invalid entity IDs which don't correspond to any entities
                  which were previously inferred from an "inferEntitiesFromWebPage"
                  tool call: ${JSON.stringify(invalidEntityIds)}
                `),
              };
            }

            state.submittedEntityIds.push(...entityIds);

            return {
              ...toolCall,
              output: `The entities with IDs ${JSON.stringify(entityIds)} where successfully submitted.   Do not call the "complete" tool unless the submitted entities satisfy
              the initial research prompt.`,
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
      return { code: StatusCode.Ok, contents: [] };
    }

    state.previousCalls = [...state.previousCalls, { completedToolCalls }];

    // writeStateToFile(state);

    const openAiResponse = await getNextToolCalls({
      state,
      prompt,
      url,
      dereferencedEntityTypes,
    });

    return await processToolCalls({
      toolCalls: openAiResponse.toolCalls,
    });
  };

  const status = await processToolCalls({
    toolCalls: initialToolCalls,
  });

  if (status.code !== StatusCode.Ok) {
    return {
      code: status.code,
      message: status.message,
      contents: [],
    };
  }

  const submittedProposedEntities =
    getSubmittedProposedEntitiesFromState(state);

  return {
    code: StatusCode.Ok,
    contents: [
      {
        inferredEntities: submittedProposedEntities.map(
          ({ localId: _localId, ...rest }) => rest,
        ),
      },
    ],
  };
};
