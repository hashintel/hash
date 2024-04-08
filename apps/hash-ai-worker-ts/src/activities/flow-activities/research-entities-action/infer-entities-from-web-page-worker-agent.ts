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

import { getWebPageActivity } from "../../get-web-page-activity";
import { modelAliasToSpecificModel } from "../../infer-entities";
import { getOpenAiResponse } from "../../infer-entities/shared/get-open-ai-response";
import { inferEntitiesFromContentAction } from "../infer-entities-from-content-action";
import { getWebPageInnerHtml } from "./infer-entities-from-web-page-worker-agent/get-web-page-inner-html";
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

const toolIds = [
  "getWebPageInnerText",
  "getWebPageInnerHtml",
  // "getWebPageSummary",
  "inferEntitiesFromText",
  "submitProposedEntities",
  "complete",
  "terminate",
  "updatePlan",
] as const;

type ToolId = (typeof toolIds)[number];

const isToolId = (value: string): value is ToolId =>
  toolIds.includes(value as ToolId);

const explanationDefinition = {
  type: "string",
  description:
    "An explanation of why this tool call is required to satisfy the task.",
} as const;

const toolDefinitions: Record<ToolId, ToolDefinition<ToolId>> = {
  getWebPageInnerText: {
    toolId: "getWebPageInnerText",
    description: "Get the inner text (i.e. the rendered text) of a web page.",
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
  inferEntitiesFromText: {
    toolId: "inferEntitiesFromText",
    description: "Infer entities from some text content.",
    inputSchema: {
      type: "object",
      properties: {
        explanation: explanationDefinition,
        text: {
          type: "string",
          description: "The text from which to infer entities.",
        },
        prompt: {
          type: "string",
          description: dedent(`
            A prompt instructing the inference agent which entities should be inferred from the text.
            Do not specify any information of the structure of the entities, as this is predefined by
              the entity type.
          `),
        },
      },
      required: ["text", "prompt", "explanation"],
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
          description: "An array of entity IDs of the entities to submit.",
        },
      },
      required: ["entityIds", "explanation"],
    },
  },
  complete: {
    toolId: "complete",
    description: "Complete the inference task.",
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
  inferEntitiesFromText: {
    text: string;
    prompt: string;
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

  You are provided with a prompt and a URL, and will have a variety of
    tools provided to you to assist in completing the task.

  To fully satisfy the prompt, you may need to use the tools to navigate
    to linked pages, and evaluate them as well as the initial page that
    is provided.
    
  This is particularly important if the contents of a page are paginated
    over multiple web pages (for example web pages containing a table)
`);

const createInitialPlan = async (params: {
  prompt: string;
  url: string;
}): Promise<{ plan: string }> => {
  const { prompt, url } = params;

  const systemMessage: ChatCompletionSystemMessageParam = {
    role: "system",
    content: dedent(`
      ${systemMessagePrefix}

      Do not make *any* tool calls. You must first provide a plan of how you will use
        the tools to progress towards completing the task.

      This should be a list of steps in plain English.
    `),
  };

  const messages: ChatCompletionMessageParam[] = [
    systemMessage,
    {
      role: "user",
      content: dedent(`
        Prompt: ${prompt}
        URL: ${url}
      `),
    },
  ];

  const openApiPayload: ChatCompletionCreateParams = {
    messages,
    model: modelAliasToSpecificModel["gpt-4-turbo"],
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

const getNextToolCalls = async (params: {
  previousPlan: string;
  previousCalls?: {
    completedToolCalls: CompletedToolCall<ToolId>[];
  }[];
  submittedProposedEntities: ProposedEntityWithLocalId[];
  prompt: string;
  url: string;
}) => {
  const {
    prompt,
    url,
    submittedProposedEntities,
    previousCalls,
    previousPlan,
  } = params;

  const systemMessage: ChatCompletionSystemMessageParam = {
    role: "system",
    content: dedent(`
      ${systemMessagePrefix}

      ${
        submittedProposedEntities.length > 0
          ? dedent(`
            You have previously submitted the following proposed entities:
            ${JSON.stringify(submittedProposedEntities, null, 2)}

            If the submitted entities satisfy the research prompt, call the "complete" tool.
          `)
          : "You have not previously submitted any proposed entities."
      }

      You have previously proposed the following plan:
      ${previousPlan}
      If you want to deviate from this plan, update it using the "updatePlan" tool.
      You must call the "updatePlan" tool alongside other tool calls to progress towards completing the task.
    `),
  };

  const messages: ChatCompletionMessageParam[] = [
    systemMessage,
    {
      role: "user",
      content: dedent(`
        Prompt: ${prompt}
        URL: ${url}
      `),
    },
    ...(previousCalls
      ? mapPreviousCallsToChatCompletionMessages({ previousCalls })
      : []),
  ];

  const openApiPayload: ChatCompletionCreateParams = {
    messages,
    model: modelAliasToSpecificModel["gpt-4-turbo"],
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

  if (!openAiToolCalls) {
    /** @todo: retry this instead */
    throw new Error(
      `Expected tool calls in response: ${JSON.stringify(response)}`,
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
  const { plan: initialPlan } = await createInitialPlan({ prompt, url });

  const { toolCalls: initialToolCalls } = await getNextToolCalls({
    previousPlan: initialPlan,
    submittedProposedEntities: [],
    prompt,
    url,
  });

  const processToolCalls = async (processToolCallsParams: {
    previousPlan: string;
    previousCalls?: {
      completedToolCalls: CompletedToolCall<ToolId>[];
    }[];
    toolCalls: ToolCall<ToolId>[];
  }): Promise<Status<never>> => {
    const { toolCalls, previousCalls } = processToolCallsParams;

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

    /**
     * This plan may be updated by the tool calls that are about to be
     * evaluated.
     */
    let latestPlan = processToolCallsParams.previousPlan;

    const completedToolCalls = await Promise.all(
      toolCallsWithRelevantResults.map(
        async (toolCall): Promise<CompletedToolCall<ToolId>> => {
          if (toolCall.toolId === "updatePlan") {
            const { plan } =
              toolCall.parsedArguments as ToolCallArguments["updatePlan"];

            latestPlan = plan;

            return {
              ...toolCall,
              output: `The plan has been successfully updated.`,
            };
          } else if (toolCall.toolId === "getWebPageInnerHtml") {
            const { url: toolCallUrl } =
              toolCall.parsedArguments as ToolCallArguments["getWebPageInnerHtml"];

            const { innerHtml } = await getWebPageInnerHtml({
              url: toolCallUrl,
            });

            return {
              ...toolCall,
              output: innerHtml,
            };
          } else if (toolCall.toolId === "getWebPageInnerText") {
            const { url: toolCallUrl } =
              toolCall.parsedArguments as ToolCallArguments["getWebPageInnerText"];

            const { textContent } = await getWebPageActivity({
              url: toolCallUrl,
            });

            return {
              ...toolCall,
              output: textContent,
            };
          } else if (toolCall.toolId === "inferEntitiesFromText") {
            const { text, prompt: toolCallPrompt } =
              toolCall.parsedArguments as ToolCallArguments["inferEntitiesFromText"];

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
                    value: entityTypeIds,
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

            proposedEntities.push(...newProposedEntitiesWithIds);

            return {
              ...toolCall,
              output: JSON.stringify(newProposedEntitiesWithIds),
            };
          } else if (toolCall.toolId === "submitProposedEntities") {
            const { entityIds } =
              toolCall.parsedArguments as ToolCallArguments["submitProposedEntities"];

            submittedEntityIds.push(...entityIds);

            return {
              ...toolCall,
              output: `The entities with IDs ${JSON.stringify(entityIds)} where successfully submitted.`,
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

    const updatedPreviousCalls = [
      ...(previousCalls ?? []),
      { completedToolCalls },
    ];

    const submittedProposedEntities = proposedEntities.filter(({ localId }) =>
      submittedEntityIds.includes(localId),
    );

    const openAiResponse = await getNextToolCalls({
      previousPlan: latestPlan,
      submittedProposedEntities,
      previousCalls: updatedPreviousCalls,
      prompt,
      url,
    });

    return await processToolCalls({
      previousPlan: latestPlan,
      previousCalls: updatedPreviousCalls,
      toolCalls: openAiResponse.toolCalls,
    });
  };

  const status = await processToolCalls({
    previousPlan: initialPlan,
    toolCalls: initialToolCalls,
  });

  if (status.code !== StatusCode.Ok) {
    return {
      code: status.code,
      message: status.message,
      contents: [],
    };
  }

  const submittedProposedEntities = proposedEntities.filter(({ localId }) =>
    submittedEntityIds.includes(localId),
  );

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
