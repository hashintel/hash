import type { SourceProvenance } from "@local/hash-graph-client";
import { SourceType } from "@local/hash-graph-client";
import type { Status } from "@local/status";
import { StatusCode } from "@local/status";
import dedent from "dedent";

import { getDereferencedEntityTypesActivity } from "../../get-dereferenced-entity-types-activity";
import { getWebPageActivity } from "../../get-web-page-activity";
import { logger } from "../../shared/activity-logger";
import type { DereferencedEntityType } from "../../shared/dereference-entity-type";
import { getFlowContext } from "../../shared/get-flow-context";
import { getLlmResponse } from "../../shared/get-llm-response";
import type {
  LlmMessage,
  LlmMessageToolResultContent,
  LlmUserMessage,
} from "../../shared/get-llm-response/llm-message";
import { getToolCallsFromLlmAssistantMessage } from "../../shared/get-llm-response/llm-message";
import type {
  LlmParams,
  ParsedLlmToolCall,
} from "../../shared/get-llm-response/types";
import { graphApiClient } from "../../shared/graph-api-client";
import { stringify } from "../../shared/stringify";
import { inferFactsFromText } from "../shared/infer-facts-from-text";
import type { LocalEntitySummary } from "../shared/infer-facts-from-text/get-entity-summaries-from-text";
import type { Fact } from "../shared/infer-facts-from-text/types";
import { generatePreviouslyInferredFactsSystemPromptMessage } from "./generate-previously-inferred-facts-system-prompt-message";
import { handleQueryPdfToolCall } from "./infer-facts-from-web-page-worker-agent/handle-query-pdf-tool-call";
import type { ToolCallArguments } from "./infer-facts-from-web-page-worker-agent/tool-definitions";
import { toolDefinitions } from "./infer-facts-from-web-page-worker-agent/tool-definitions";
import type {
  AccessedRemoteFile,
  InferFactsFromWebPageWorkerAgentInput,
  InferFactsFromWebPageWorkerAgentState,
  ToolName,
} from "./infer-facts-from-web-page-worker-agent/types";
import { updateStateFromInferredFacts } from "./infer-facts-from-web-page-worker-agent/update-state-from-inferred-facts";
import type { CompletedToolCall } from "./types";
import { mapPreviousCallsToLlmMessages } from "./util";

const model: LlmParams["model"] = "claude-3-opus-20240229";

const generateSystemMessagePrefix = (params: {
  input: InferFactsFromWebPageWorkerAgentInput;
}) => {
  const { linkEntityTypes } = params.input;

  return dedent(`
    You are an infer facts from web page agent, with the goal
      of inferring facts about entities a web page or pages linked to by
      the web page.

    The user will provide you with:
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

    You will be provided with a variety of tools to complete the task.

    To fully satisfy the prompt, you may need to use the tools to navigate
      to linked pages, and evaluate them as well as the initial page that
      is provided.

    This is particularly important if the contents of a page are paginated
      over multiple web pages (for example web pages containing a table).

    Make as many different tool calls in parallel as possible. For example, call "inferFactsFromWebPage"
      alongside "getWebPageInnerHtml" to get the content of another web page which may contain
      more entities. Do not make more than one "getWebPageInnerHtml" tool call at a time.

    Do not under any circumstances make a tool call to a tool which you haven't
      been provided with.
  `);
};

const generateUserMessage = (params: {
  input: InferFactsFromWebPageWorkerAgentInput;
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
  input: InferFactsFromWebPageWorkerAgentInput;
  retryMessages?: LlmMessage[];
  retryCount?: number;
}): Promise<{ plan: string }> => {
  const { input, retryMessages } = params;

  const systemPrompt = dedent(`
      ${generateSystemMessagePrefix({ input })}

      You must now make an "updatePlan" tool call, to provide your initial plan for
        how you will use the tools to progress towards completing the task.

      Remember that you may need to navigate to other web pages which are linked on the
        initial web page, to find all the facts about entities required to satisfy the prompt.
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
      toolChoice: "updatePlan",
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

  const { message } = llmResponse;

  const toolCalls = getToolCallsFromLlmAssistantMessage({ message });

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

  const updatePlanToolCall = toolCalls.find(
    (toolCall) => toolCall.name === "updatePlan",
  );

  if (!updatePlanToolCall) {
    if (toolCalls.length > 0) {
      return retry({
        retryMessageContent: [
          ...toolCalls.map<LlmMessageToolResultContent>((toolCall) => ({
            type: "tool_result",
            tool_use_id: toolCall.id,
            content: dedent(`
              You cannot make this tool call yet.
              You must first make a single tool call to the "updatePlan" tool with your initial plan.
            `),
            is_error: true,
          })),
        ],
      });
    } else {
      return retry({
        retryMessageContent: [
          {
            type: "text",
            text: dedent(`
              You didn't make a "updatePlan" tool call.
              You must make a single "updatePlan" tool call with your initial plan, before doing anything else.
            `),
          },
        ],
      });
    }
  }

  const { plan } = updatePlanToolCall.input as ToolCallArguments["updatePlan"];

  return { plan };
};

const getNextToolCalls = async (params: {
  input: InferFactsFromWebPageWorkerAgentInput;
  state: InferFactsFromWebPageWorkerAgentState;
}): Promise<{ toolCalls: ParsedLlmToolCall<ToolName>[] }> => {
  const { state, input } = params;

  const systemPrompt = dedent(`
      ${generateSystemMessagePrefix({ input })}

      You have previously proposed the following plan:
      ${state.currentPlan}
      
      If you want to deviate from this plan, update it using the "updatePlan" tool.
      You must call the "updatePlan" tool alongside other tool calls to progress towards completing the task.

      To constrain the size of the chat history, some message outputs may have been omitted.
      
      Here's a summary of what you've previously done:

      You have previously inferred facts from the following webpages: ${JSON.stringify(state.inferredFactsFromWebPageUrls)}
      You have previously inferred facts from the following files: ${JSON.stringify(state.filesUsedToInferFacts.map(({ url }) => url))}
      ${generatePreviouslyInferredFactsSystemPromptMessage(state)}
      ${
        state.inferredFactsAboutEntities.length > 0
          ? `If the facts about entities satisfy the user's research prompt, you may call the "complete" tool.`
          : ""
      }
    `);

  const messages: LlmMessage[] = [
    generateUserMessage({
      input,
      /**
       * Include the inner HTML of the original web page in the user message
       * if no further HTML content has been requested in other tool calls.
       */
      includeInnerHtml: !state.previousCalls.some(({ completedToolCalls }) =>
        completedToolCalls.some(({ name }) => name === "getWebPageInnerHtml"),
      ),
    }),
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
      toolChoice: "required",
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

  const { message } = llmResponse;

  const toolCalls = getToolCallsFromLlmAssistantMessage({ message });

  return { toolCalls };
};

const getTopLevelDomain = (url: string) => {
  const parsedUrl = new URL(url);
  const hostnameParts = parsedUrl.hostname.split(".");

  if (hostnameParts.length > 1) {
    return hostnameParts.slice(-2).join(".");
  }
};

const haveSameTopLevelDomain = (url1: string, url2: string): boolean => {
  const tld1 = getTopLevelDomain(url1);
  const tld2 = getTopLevelDomain(url2);

  if (tld1 && tld2) {
    return tld1 === tld2;
  }

  return false;
};

export const inferFactsFromWebPageWorkerAgent = async (params: {
  prompt: string;
  entityTypes: DereferencedEntityType[];
  linkEntityTypes?: DereferencedEntityType[];
  url: string;
  testingParams?: {
    persistState?: (state: InferFactsFromWebPageWorkerAgentState) => void;
    resumeFromState?: InferFactsFromWebPageWorkerAgentState;
  };
}): Promise<
  Status<{
    inferredFactsAboutEntities: LocalEntitySummary[];
    inferredFacts: Fact[];
    filesUsedToInferFacts: AccessedRemoteFile[];
    suggestionForNextSteps: string;
  }>
> => {
  const { url, testingParams } = params;

  /**
   * We start by making a asking the coordinator agent to create an initial plan
   * for the research task. We include the inner HTML for the web page in this
   * call, to help it formulate a better initial plan.
   */
  const { htmlContent: initialWebPageInnerHtml } = await getWebPageActivity({
    url,
    sanitizeForLlm: true,
  });

  const input: InferFactsFromWebPageWorkerAgentInput = {
    prompt: params.prompt,
    entityTypes: params.entityTypes,
    linkEntityTypes: params.linkEntityTypes,
    url,
    innerHtml: initialWebPageInnerHtml,
  };

  let state: InferFactsFromWebPageWorkerAgentState;

  if (testingParams?.resumeFromState) {
    state = testingParams.resumeFromState;
  } else {
    const { plan: initialPlan } = await createInitialPlan({
      input,
    });

    logger.debug(`Worker agent initial plan: ${initialPlan}`);

    state = {
      currentPlan: initialPlan,
      previousCalls: [],
      inferredFactsAboutEntities: [],
      inferredFacts: [],
      inferredFactsFromWebPageUrls: [],
      filesQueried: [],
      filesUsedToInferFacts: [],
    };
  }

  const { userAuthentication } = await getFlowContext();

  const { toolCalls: initialToolCalls } = await getNextToolCalls({
    state,
    input,
  });

  const processToolCalls = async (processToolCallsParams: {
    toolCalls: ParsedLlmToolCall<ToolName>[];
  }): Promise<Status<{ suggestionForNextSteps: string }>> => {
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

            /**
             * @todo: consider removing this limitation, by providing the caller of
             * the worker agent with a list of the URLs which the worker agent has
             * accessed that are not from the same top-level domain to avoid the
             * same webpage being accessed multiple times for the same purpose.
             *
             * @see https://linear.app/hash/issue/H-2893/reduce-token-consumption-in-worker-agent
             */
            if (!haveSameTopLevelDomain(toolCallUrl, input.url)) {
              return {
                ...toolCall,
                output: dedent(`
                  The URL provided is not from the same top level domain as the initial web page URL.
                  You can only access web pages which are linked to by the initial web page and are hosted on the same top-level domain.
                `),
                isError: true,
              };
            }

            const urlHeadFetch = await fetch(toolCallUrl, { method: "HEAD" });

            /**
             * Only check the content type of the URL if the HEAD request was successful.
             *
             * This may be because the web page requires an authenticated user to access it.
             */
            if (urlHeadFetch.ok) {
              const contentType = urlHeadFetch.headers.get("Content-Type");

              if (contentType && contentType.includes("application/pdf")) {
                return {
                  ...toolCall,
                  output: dedent(`
                    The URL provided is a PDF file.
                    You must use the "queryPdf" tool to extract the text content from the PDF.
                    Detected Content-Type: ${contentType}
                  `),
                  isError: true,
                };
              }
            }

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
              If there are any facts in this HTML which you think are relevant to the task, you must
                immediately call the "inferFactsFromWebPage" tool with the relevant HTML content from the HTML.
              
              If there are any navigation links in the HTML which may also contain relevant facts, you should
                make additional "getWebPageInnerHtml" tool calls to get the content of those pages.

              Note that you will only be able to see one HTML page at a time, so do not make a single "getWebPageInnerHtml"
                tool call unless there are no entities to infer from this page.
              `),
            };
          } else if (toolCall.name === "inferFactsFromWebPage") {
            const toolCallInput =
              toolCall.input as ToolCallArguments["inferFactsFromWebPage"];

            if (!haveSameTopLevelDomain(toolCallInput.url, input.url)) {
              return {
                ...toolCall,
                output: dedent(`
                  The URL provided is not from the same top level domain as the initial web page URL.
                  You must only infer facts from web pages which are linked to by the initial web page and are hosted on the same top-level domain.
                `),
                isError: true,
              };
            }

            const { prompt: toolCallPrompt } = toolCallInput;

            state.inferredFactsFromWebPageUrls.push(toolCallInput.url);

            let content = "";

            const webPage = await getWebPageActivity({
              url: toolCallInput.url,
              sanitizeForLlm: true,
            });

            content = dedent(`
                The following HTML content was obtained from the web page with title "${webPage.title}", hosted at the URL "${toolCallInput.url}".
                ---------------- START OF INNER HTML ----------------
                ${webPage.htmlContent}
                ---------------- END OF INNER HTML ----------------
              `);

            const dereferencedEntityTypes =
              await getDereferencedEntityTypesActivity({
                entityTypeIds: [
                  ...input.entityTypes.map(({ $id }) => $id),
                  ...(input.linkEntityTypes?.map(({ $id }) => $id) ?? []),
                ],
                graphApiClient,
                actorId: userAuthentication.actorId,
                simplifyPropertyKeys: true,
              });

            /**
             * @todo: Restore ability to link to existing entities, when proposing facts.
             *
             * @see https://linear.app/hash/issue/H-2713/add-ability-to-specify-existingentities-when-inferring-facts-so-that
             */
            const { facts: inferredFacts, entitySummaries } =
              await inferFactsFromText({
                text: content,
                dereferencedEntityTypes,
                relevantEntitiesPrompt: toolCallPrompt,
              });

            const factSource: SourceProvenance = {
              type: SourceType.Webpage,
              location: {
                uri: toolCallInput.url,
                /** @todo */
                name: undefined,
                description: undefined,
              },
              loadedAt: new Date().toISOString(),
              /** @todo */
              authors: undefined,
              firstPublished: undefined,
              lastUpdated: undefined,
            };

            const inferredFactsWithSource = inferredFacts.map((fact) => ({
              ...fact,
              sources: [...(fact.sources ?? []), factSource],
            }));

            await updateStateFromInferredFacts({
              state,
              inferredFacts: inferredFactsWithSource,
              inferredFactsAboutEntities: entitySummaries,
              filesUsedToInferFacts: [],
            });

            return {
              ...toolCall,
              output: dedent(`
                ${inferredFacts.length} facts were successfully inferred for the following entities: ${JSON.stringify(entitySummaries)}
              `),
            };
          } else if (toolCall.name === "queryFactsFromPdf") {
            return handleQueryPdfToolCall({
              input,
              state,
              toolCall: toolCall as ParsedLlmToolCall<"queryFactsFromPdf">,
            });
          }

          throw new Error(`Unimplemented tool call: ${toolCall.name}`);
        },
      ),
    );

    const completeToolCall = toolCalls.find(
      (toolCall) => toolCall.name === "complete",
    );

    /**
     * Check whether the research task has completed after processing the tool calls,
     * incase the agent has made other tool calls at the same time as the "complete" tool call.
     */
    if (completeToolCall) {
      const { suggestionForNextSteps } =
        completeToolCall.input as ToolCallArguments["complete"];
      return { code: StatusCode.Ok, contents: [{ suggestionForNextSteps }] };
    }

    state.previousCalls = [...state.previousCalls, { completedToolCalls }];

    if (testingParams?.persistState) {
      testingParams.persistState(state);
    }

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

  const { suggestionForNextSteps } = status.contents[0]!;

  return {
    code: StatusCode.Ok,
    contents: [
      {
        inferredFacts: state.inferredFacts,
        inferredFactsAboutEntities: state.inferredFactsAboutEntities,
        filesUsedToInferFacts: state.filesUsedToInferFacts,
        suggestionForNextSteps,
      },
    ],
  };
};
