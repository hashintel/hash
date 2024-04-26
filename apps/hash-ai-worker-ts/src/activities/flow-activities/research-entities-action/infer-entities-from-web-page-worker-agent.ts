import type { VersionedUrl } from "@blockprotocol/type-system";
import type { Subtype } from "@local/advanced-types/subtype";
import type {
  InputNameForAction,
  OutputNameForAction,
} from "@local/hash-isomorphic-utils/flows/action-definitions";
import { actionDefinitions } from "@local/hash-isomorphic-utils/flows/action-definitions";
import type {
  ProposedEntity,
  StepInput,
} from "@local/hash-isomorphic-utils/flows/types";
import type { Entity } from "@local/hash-subgraph";
import type { Status } from "@local/status";
import { StatusCode } from "@local/status";
import dedent from "dedent";

import { getWebPageActivity } from "../../get-web-page-activity";
import { logger } from "../../shared/activity-logger";
import type { DereferencedEntityType } from "../../shared/dereference-entity-type";
import { getFlowContext } from "../../shared/get-flow-context";
import { getLlmResponse } from "../../shared/get-llm-response";
import type {
  LlmMessage,
  LlmUserMessage,
} from "../../shared/get-llm-response/llm-message";
import {
  getTextContentFromLlmMessage,
  getToolCallsFromLlmAssistantMessage,
} from "../../shared/get-llm-response/llm-message";
import type {
  LlmToolDefinition,
  ParsedLlmToolCall,
} from "../../shared/get-llm-response/types";
import { graphApiClient } from "../../shared/graph-api-client";
import type { PermittedOpenAiModel } from "../../shared/openai-client";
import { stringify } from "../../shared/stringify";
import { inferEntitiesFromContentAction } from "../infer-entities-from-content-action";
import { indexPdfFile } from "./infer-entities-from-web-page-worker-agent/llama-index/index-pdf-file";
import type {
  InferEntitiesFromWebPageWorkerAgentState,
  ToolName,
} from "./infer-entities-from-web-page-worker-agent/types";
// import { retrievePreviousState, writeStateToFile } from "./testing-utils";
import type { CompletedToolCall } from "./types";
import { mapPreviousCallsToLlmMessages } from "./util";

const model: PermittedOpenAiModel = "gpt-4-0125-preview";

type SummarizedEntity = {
  id: string;
  entityTypeId: VersionedUrl;
  summary: string;
};

const mapProposedEntityToSummarizedEntity = (
  entity: ProposedEntity,
): SummarizedEntity => {
  if (!entity.summary) {
    throw new Error("Expected proposed entity to have a summary.");
  }
  return {
    id: entity.localEntityId,
    entityTypeId: entity.entityTypeId,
    summary: entity.summary ?? "",
  };
};

const explanationDefinition = {
  type: "string",
  description: dedent(`
    An explanation of why this tool call is required to satisfy the task,
    and how it aligns with the current plan. If the plan needs to be modified,
    make a call to the "updatePlan" tool.
  `),
} as const;

const toolDefinitions: Record<ToolName, LlmToolDefinition<ToolName>> = {
  getWebPageInnerHtml: {
    name: "getWebPageInnerHtml",
    description: dedent(`
      Get the inner HTML of a web page.
      Do not call this tool for files hosted at a URL, only for web pages.
      You can use the "queryPdf" tool to query a PDF document at a URL instead.
    `),
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
    name: "inferEntitiesFromWebPage",
    description: "Infer entities from some text content.",
    inputSchema: {
      type: "object",
      properties: {
        explanation: explanationDefinition,
        url: {
          type: "string",
          description: "The URL of the web page.",
        },
        hmtlContent: {
          type: "string",
          description: dedent(`
            The HTML content with the relevant sections, paragraphs, tables
              or other content from the webpage that describe entities of the requested type(s).

            You must not modify the content in any way.

            You must include table headers when passing data from a table.

            Do not under any circumstance truncate or provide partial text which may lead to missed entities
              or properties.

            You must provide as much text as necessary to infer all
              the required entities and their properties from the web page in a single tool call.

            ${
              ""
              /**
               * Note: This was previously included to sometimes improve the unit formatting
               * for the inference agent, however this came with the cost that the worker
               * agent would frequently truncate text. This has been omitted so that the
               * unit inference becomes the responsibility of the inference agent.
               */
              // For example if the text contains data from a table, you must provide the table
              // column names. If the are column names specifying units, you must explicitly
              // specify the unit for each value in the table. For example if the column
              // specifies a unit in millions (m), append this to each value (e.g. "10 million (m)").

              /** Note: the agent doesn't do this even if you ask it to */
              // If there are units in the data, you must give a detailed definition for
              // each unit and what it means.
            }
            `),
        },
        /**
         * @todo: consider letting the agent set `"unknown"` or `"as many as possible"` as
         * an argument here, incase it isn't sure of the number of entities that can be inferred.
         */
        expectedNumberOfEntities: {
          type: "number",
          description: dedent(`
            The expected number of entities which should be inferred from the HTML content.
            You should expect at least 1 entity to be inferred.
          `),
        },
        validAt: {
          type: "string",
          format: "date-time",
          description: dedent(`
            A date-time string in ISO 8601 format, representing when the provided HTML content is valid at.
            If this cannot be found on the web page, assume it is the current date and time.
            The current time is "${new Date().toISOString()}".
          `),
        },
        prompt: {
          type: "string",
          description: dedent(`
            A prompt instructing the inference agent which entities should be inferred from the HTML content.
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
            An array of entity type IDs which should be inferred from the provided HTML content.
          `),
        },
        linkEntityTypeIds: {
          type: "array",
          items: {
            type: "string",
          },
          description: dedent(`
            An array of link entity type IDs which should be inferred from provided HTML content.
          `),
        },
      },
      required: [
        "url",
        "hmtlContent",
        "expectedNumberOfEntities",
        "validAt",
        "prompt",
        "explanation",
        "entityTypeIds",
      ],
    },
  },
  submitProposedEntities: {
    name: "submitProposedEntities",
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
  queryPdf: {
    name: "queryPdf",
    description: dedent(`
      Query a PDF document at a URL.
      Use this tool to ask questions about the content of a PDF document, hosted at a URL.
      You will be provided with a response to the query, as well as the relevant text from the document
        used to answer the query.
    `),
    inputSchema: {
      type: "object",
      properties: {
        explanation: explanationDefinition,
        fileUrl: {
          type: "string",
          description: "The URL of the PDF document.",
        },
        query: {
          type: "string",
          description: dedent(`
            The query to search for in the PDF document.
            Be as specific as possible about the information you are looking for.
            If you are looking for a list of something, specify the list and what data it should contain.
          `),
        },
      },
      required: ["fileUrl", "query", "explanation"],
    },
  },
  complete: {
    name: "complete",
    description: dedent(`
      Complete the inference task.
      You must explain how the task has been completed with the existing submitted entities.
      Do not make this tool call if the research prompt hasn't been fully satisfied.
    `),
    inputSchema: {
      type: "object",
      properties: {
        explanation: explanationDefinition,
      },
      required: ["explanation"],
    },
  },
  terminate: {
    name: "terminate",
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
    name: "updatePlan",
    description:
      "Update the plan for the research task. You should call this alongside other tool calls to progress towards completing the task.",
    inputSchema: {
      type: "object",
      properties: {
        explanation: {
          type: "string",
          description: dedent(`
            An explanation of why the plan needs to be updated, and
            how it aligns with the current plan.
          `),
        },
        plan: {
          type: "string",
          description: "The updated plan for the research task.",
        },
      },
      required: ["plan", "explanation"],
    },
  },
};

type ToolCallArguments = Subtype<
  Record<ToolName, unknown>,
  {
    getWebPageInnerHtml: {
      url: string;
    };
    inferEntitiesFromWebPage: {
      url: string;
      hmtlContent: string;
      expectedNumberOfEntities: number;
      validAt: string;
      prompt: string;
      entityTypeIds: VersionedUrl[];
      linkEntityTypeIds?: VersionedUrl[];
    };
    submitProposedEntities: {
      entityIds: string[];
    };
    updatePlan: {
      plan: string;
    };
    complete: never;
    terminate: never;
    queryPdf: {
      fileUrl: string;
      query: string;
    };
  }
>;

type WorkerAgentInput = {
  prompt: string;
  entityTypes: DereferencedEntityType[];
  linkEntityTypes?: DereferencedEntityType[];
  existingEntities?: Entity[];
  url: string;
  innerHtml: string;
};

const generateSystemMessagePrefix = (params: { input: WorkerAgentInput }) => {
  const { linkEntityTypes, existingEntities } = params.input;

  return dedent(`
    You are an infer entities from web page worker agent, with the goal
      of inferring specific entities from a web page or pages linked to by
      the web page.

    You are provided by the user with:
      - Prompt: the prompt you need to satisfy to complete the research task
      - Initial web page url: the url of the initial web page you should use to infer entities
      - Entity Types: the types of entities you can propose to satisfy the research prompt
      ${
        linkEntityTypes
          ? dedent(`
      - Link Types: the types of links you can propose between entities
      `)
          : ""
      }
      ${
        existingEntities
          ? dedent(`
      - Existing Entities: a list of existing entities, that may contain relevant information
        and you may want to link to from the proposed entities.
      `)
          : ""
      }

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
};

const generateUserMessage = (params: {
  input: WorkerAgentInput;
  includeInnerHtml?: boolean;
}): LlmUserMessage => {
  const { includeInnerHtml = false, input } = params;
  const { prompt, url, innerHtml, entityTypes, linkEntityTypes } = input;

  return {
    role: "user",
    content: [
      {
        type: "text",
        text: dedent(`
          Prompt: ${prompt}
          Initial web page url: ${url}
          Entity Types: ${JSON.stringify(entityTypes)}
          ${linkEntityTypes ? `Link Types: ${JSON.stringify(linkEntityTypes)}` : ""}
          ${includeInnerHtml ? `Initial web page inner HTML: ${innerHtml}` : ""}
        `),
      },
    ],
  };
};

const maxRetryCount = 3;

const createInitialPlan = async (params: {
  input: WorkerAgentInput;
  retryMessages?: LlmMessage[];
  retryCount?: number;
}): Promise<{ plan: string }> => {
  const { input, retryMessages } = params;

  const systemPrompt = dedent(`
      ${generateSystemMessagePrefix({ input })}

      Do not make *any* tool calls. You must first provide a plan of how you will use
        the tools to progress towards completing the task.

      This should be a list of steps in plain English.

      Remember that you may need to navigate to other web pages which are linked on the
      initial web page, to find all the entities required to satisfy the prompt.
    `);

  const messages = [
    generateUserMessage({ input, includeInnerHtml: true }),
    ...(retryMessages ?? []),
  ];

  const { userAuthentication, flowEntityId, webId } = await getFlowContext();

  const llmResponse = await getLlmResponse(
    {
      systemPrompt,
      messages,
      model,
      tools: Object.values(toolDefinitions),
    },
    {
      userAccountId: userAuthentication.actorId,
      graphApiClient,
      incurredInEntities: [{ entityId: flowEntityId }],
      webId,
    },
  );

  if (llmResponse.status !== "ok") {
    throw new Error(
      `Failed to get LLM response: ${JSON.stringify(llmResponse)}`,
    );
  }

  const { message, stopReason, usage: _usage } = llmResponse;

  /** @todo: capture usage */

  const retry = (retryParams: {
    retryMessageContent: LlmUserMessage["content"];
  }) => {
    if ((params.retryCount ?? 0) >= maxRetryCount) {
      throw new Error(
        `Exceeded retry count when generating initial plan, with retry reasons: ${JSON.stringify(retryParams.retryMessageContent)}`,
      );
    }

    return createInitialPlan({
      input,
      retryMessages: [
        message,
        {
          role: "user",
          content: retryParams.retryMessageContent,
        },
      ],
      retryCount: (params.retryCount ?? 0) + 1,
    });
  };

  if (stopReason === "tool_use") {
    return retry({
      retryMessageContent: [
        {
          type: "text",
          text: "You must not make any tool calls yet. Provide your initial plan instead.",
        },
      ],
    });
  }

  const messageText = getTextContentFromLlmMessage({ message });

  if (!messageText) {
    return retry({
      retryMessageContent: [
        {
          type: "text",
          text: "You did not provide a plan in your response.",
        },
      ],
    });
  }

  return { plan: messageText };
};

const getSubmittedProposedEntitiesFromState = (
  state: InferEntitiesFromWebPageWorkerAgentState,
): ProposedEntity[] =>
  state.proposedEntities.filter(({ localEntityId }) =>
    state.submittedEntityIds.includes(localEntityId),
  );

const getNextToolCalls = async (params: {
  input: WorkerAgentInput;
  state: InferEntitiesFromWebPageWorkerAgentState;
}): Promise<{ toolCalls: ParsedLlmToolCall<ToolName>[] }> => {
  const { state, input } = params;

  const submittedProposedEntities =
    getSubmittedProposedEntitiesFromState(state);

  const systemPrompt = dedent(`
      ${generateSystemMessagePrefix({ input })}

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
            ${JSON.stringify(submittedProposedEntities.map(mapProposedEntityToSummarizedEntity))}

            If the submitted entities satisfy the research prompt, call the "complete" tool.
          `)
          : "You have not previously submitted any proposed entities."
      }
    `);

  const messages: LlmMessage[] = [
    generateUserMessage({ input }),
    ...mapPreviousCallsToLlmMessages({
      previousCalls: state.previousCalls,
    }),
  ];

  const { userAuthentication, flowEntityId, webId } = await getFlowContext();

  const llmResponse = await getLlmResponse(
    {
      systemPrompt,
      messages,
      model,
      tools: Object.values(toolDefinitions),
    },
    {
      userAccountId: userAuthentication.actorId,
      graphApiClient,
      incurredInEntities: [{ entityId: flowEntityId }],
      webId,
    },
  );

  if (llmResponse.status !== "ok") {
    throw new Error(
      `Failed to get LLM response: ${JSON.stringify(llmResponse)}`,
    );
  }

  const { message, usage: _usage } = llmResponse;

  const toolCalls = getToolCallsFromLlmAssistantMessage({ message });

  /** @todo: capture usage */

  return { toolCalls };
};

export const inferEntitiesFromWebPageWorkerAgent = async (params: {
  prompt: string;
  entityTypes: DereferencedEntityType[];
  linkEntityTypes?: DereferencedEntityType[];
  url: string;
  existingEntities?: Entity[];
}): Promise<
  Status<{
    inferredEntities: ProposedEntity[];
  }>
> => {
  const { url, existingEntities } = params;

  /**
   * We start by making a asking the coordinator agent to create an initial plan
   * for the research task. We include the inner HTML for the web page in this
   * call, to help it formulate a better initial plan.
   */
  const { htmlContent: initialWebPageInnerHtml } = await getWebPageActivity({
    url,
    sanitizeForLlm: true,
  });

  const input: WorkerAgentInput = {
    prompt: params.prompt,
    entityTypes: params.entityTypes,
    linkEntityTypes: params.linkEntityTypes,
    existingEntities,
    url,
    innerHtml: initialWebPageInnerHtml,
  };

  const { plan: initialPlan } = await createInitialPlan({
    input,
  });

  logger.debug(`Worker agent initial plan: ${initialPlan}`);

  const state: InferEntitiesFromWebPageWorkerAgentState = {
    currentPlan: initialPlan,
    previousCalls: [],
    proposedEntities: [],
    submittedEntityIds: [],
    inferredEntitiesFromWebPageUrls: [],
    idCounter: 0,
  };

  // const state = retrievePreviousState();

  const { toolCalls: initialToolCalls } = await getNextToolCalls({
    state,
    input,
  });

  const processToolCalls = async (processToolCallsParams: {
    toolCalls: ParsedLlmToolCall<ToolName>[];
  }): Promise<Status<never>> => {
    const { toolCalls } = processToolCallsParams;

    logger.debug(`Worker agent processing tool calls: ${stringify(toolCalls)}`);

    const terminatedToolCall = toolCalls.find(
      (toolCall) => toolCall.name === "terminate",
    );

    if (terminatedToolCall) {
      return {
        code: StatusCode.Aborted,
        message: "The task was terminated by the worker agent.",
        contents: [],
      };
    }

    const toolCallsWithRelevantResults = toolCalls.filter(
      ({ name }) => name !== "complete" && name !== "terminate",
    );

    const completedToolCalls = await Promise.all(
      toolCallsWithRelevantResults.map(
        async (toolCall): Promise<CompletedToolCall<ToolName>> => {
          if (toolCall.name === "updatePlan") {
            const { plan } = toolCall.input as ToolCallArguments["updatePlan"];

            state.currentPlan = plan;

            return {
              ...toolCall,
              output: `The plan has been successfully updated.`,
            };
          } else if (toolCall.name === "getWebPageInnerHtml") {
            const { url: toolCallUrl } =
              toolCall.input as ToolCallArguments["getWebPageInnerHtml"];

            const { htmlContent } = await getWebPageActivity({
              url: toolCallUrl,
              sanitizeForLlm: true,
            });

            state.previousCalls = state.previousCalls.map((previousCall) => ({
              ...previousCall,
              completedToolCalls: previousCall.completedToolCalls.map(
                (completedToolCall) => {
                  if (completedToolCall.name === "getWebPageInnerHtml") {
                    return {
                      ...completedToolCall,
                      redactedOutputMessage: dedent(`
                        The inner HTML of the web page with URL ${(completedToolCall.input as ToolCallArguments["getWebPageInnerHtml"]).url} has been redacted to reduce the length of this chat.
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
              ${htmlContent}
              ---------------- END OF INNER HTML ----------------
              If there are any entities in this HTML which you think are relevant to the task, you must
                immediately call the "inferEntitiesFromWebPage" tool with the relevant HTML content from the HTML.
              
              If there are any links in the HTML which may also contain relevant entities, you should
                make additional "getWebPageInnerHtml" tool calls to get the content of those pages.

              Note that you will only be able to see one HTML page at a time, so do not make a single "getWebPageInnerHtml"
                tool call unless there are no entities to infer from this page.
              `),
            };
          } else if (toolCall.name === "inferEntitiesFromWebPage") {
            const {
              hmtlContent,
              prompt: toolCallPrompt,
              url: inferringEntitiesFromWebPageUrl,
              expectedNumberOfEntities,
              validAt,
              entityTypeIds: inferringEntitiesOfTypeIds,
              linkEntityTypeIds: inferringLinkEntitiesOfTypeIds,
            } = toolCall.input as ToolCallArguments["inferEntitiesFromWebPage"];

            if (expectedNumberOfEntities < 1) {
              return {
                ...toolCall,
                output: dedent(`
                  You provided an expected number of entities which is less than 1. You must provide
                  a positive integer as the expected number of entities to infer.
                `),
                isError: true,
              };
            }

            const validEntityTypeIds = input.entityTypes.map(({ $id }) => $id);

            const invalidEntityTypeIds = inferringEntitiesOfTypeIds.filter(
              (entityTypeId) => !validEntityTypeIds.includes(entityTypeId),
            );

            const validLinkEntityTypeIds = input.linkEntityTypes?.map(
              ({ $id }) => $id,
            );

            const invalidLinkEntityTypeIds =
              inferringLinkEntitiesOfTypeIds?.filter(
                (entityTypeId) =>
                  !validLinkEntityTypeIds?.includes(entityTypeId),
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
                        You provided invalid entityTypeIds which don't correspond to the entity types
                        which were initially provided: ${JSON.stringify(invalidEntityTypeIds)}

                        The possible entity types you can submit are: ${JSON.stringify(
                          validEntityTypeIds,
                        )}
                      `)
                      : ""
                  }
                  ${
                    invalidLinkEntityTypeIds.length > 0
                      ? dedent(`
                        You provided invalid linkEntityTypeIds which don't correspond to the link entity types
                        which were initially provided: ${JSON.stringify(invalidLinkEntityTypeIds)}

                        The possible link entity types you can submit are: ${JSON.stringify(
                          validLinkEntityTypeIds,
                        )}
                      `)
                      : ""
                  }
                `),
                isError: true,
              };
            }

            if (hmtlContent.length === 0) {
              return {
                ...toolCall,
                output: dedent(`
                  You provided an empty string as the HTML content from the web page. You must provide
                  the relevant HTML content from the web page to infer entities.
                `),
                isError: true,
              };
            }

            state.inferredEntitiesFromWebPageUrls.push(
              inferringEntitiesFromWebPageUrl,
            );

            const content = dedent(`
              ${hmtlContent}
              The above data is valid at ${validAt}.
            `);

            const response = await inferEntitiesFromContentAction({
              inputs: [
                {
                  inputName:
                    "content" satisfies InputNameForAction<"inferEntitiesFromContent">,
                  payload: { kind: "Text", value: content },
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
                /**
                 * Consider allowing the worker agent to decide which existing entities
                 * are provided to the inference agent.
                 */
                ...(existingEntities && existingEntities.length > 0
                  ? [
                      {
                        inputName:
                          "existingEntities" satisfies InputNameForAction<"inferEntitiesFromContent">,
                        payload: {
                          kind: "Entity" as const,
                          value: existingEntities,
                        },
                      },
                    ]
                  : []),
                ...actionDefinitions.inferEntitiesFromContent.inputs.flatMap<StepInput>(
                  ({ name, default: defaultValue }) =>
                    defaultValue
                      ? [{ inputName: name, payload: defaultValue }]
                      : [],
                ),
              ],
            });

            if (response.code !== StatusCode.Ok) {
              return {
                ...toolCall,
                output: `An unexpected error occurred inferring entities from the web page with url ${url}, try another website.`,
              };
            }

            const { outputs } = response.contents[0]!;

            const newProposedEntities = outputs.find(
              ({ outputName }) =>
                outputName ===
                ("proposedEntities" satisfies OutputNameForAction<"inferEntitiesFromContent">),
            )?.payload.value as ProposedEntity[];

            state.proposedEntities.push(...newProposedEntities);

            const summarizedNewProposedEntities = newProposedEntities.map(
              mapProposedEntityToSummarizedEntity,
            );

            if (newProposedEntities.length !== expectedNumberOfEntities) {
              return {
                ...toolCall,
                output: dedent(`
                  The following entities were inferred from the provided HTML content: ${JSON.stringify(summarizedNewProposedEntities)}

                  The number of entities inferred from the HTML content doesn't match the expected number of entities.
                  Expected: ${expectedNumberOfEntities}
                  Actual: ${newProposedEntities.length}

                  If there are missing entities which you require, you must make another "inferEntitiesFromWebPage" tool call
                    with the relevant HTML content to try again.
                `),
              };
            }

            return {
              ...toolCall,
              output: JSON.stringify(summarizedNewProposedEntities),
            };
          } else if (toolCall.name === "submitProposedEntities") {
            const { entityIds } =
              toolCall.input as ToolCallArguments["submitProposedEntities"];

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
          } else if (toolCall.name === "queryPdf") {
            const { query, fileUrl } =
              toolCall.input as ToolCallArguments["queryPdf"];

            const { vectorStoreIndex } = await indexPdfFile({ fileUrl });

            const queryEngine = vectorStoreIndex.asQueryEngine();

            const { response, sourceNodes } = await queryEngine.query({
              query,
            });

            return {
              ...toolCall,
              output: dedent(`
                Response: ${response}
                Source Nodes: ${JSON.stringify(sourceNodes)}
              `),
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
      return { code: StatusCode.Ok, contents: [] };
    }

    state.previousCalls = [...state.previousCalls, { completedToolCalls }];

    // writeStateToFile(state);

    const { toolCalls: nextToolCalls } = await getNextToolCalls({
      state,
      input,
    });

    return await processToolCalls({
      toolCalls: nextToolCalls,
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
        inferredEntities: submittedProposedEntities,
      },
    ],
  };
};
