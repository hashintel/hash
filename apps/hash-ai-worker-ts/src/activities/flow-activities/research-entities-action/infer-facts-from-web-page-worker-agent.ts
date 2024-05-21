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
  LlmUserMessage,
} from "../../shared/get-llm-response/llm-message";
import {
  getTextContentFromLlmMessage,
  getToolCallsFromLlmAssistantMessage,
} from "../../shared/get-llm-response/llm-message";
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
// import { retrievePreviousState, writeStateToFile } from "./testing-utils";
import type { CompletedToolCall } from "./types";
import { mapPreviousCallsToLlmMessages } from "./util";

const model: LlmParams["model"] = "gpt-4-0125-preview";

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

      Do not make *any* tool calls. You must first provide a plan of how you will use
        the tools to progress towards completing the task.

      This should be a list of steps in plain English.

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

  const { message, stopReason } = llmResponse;

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

  const { message } = llmResponse;

  const toolCalls = getToolCallsFromLlmAssistantMessage({ message });

  return { toolCalls };
};

export const inferFactsFromWebPageWorkerAgent = async (params: {
  prompt: string;
  entityTypes: DereferencedEntityType[];
  linkEntityTypes?: DereferencedEntityType[];
  url: string;
}): Promise<
  Status<{
    inferredFactsAboutEntities: LocalEntitySummary[];
    inferredFacts: Fact[];
    filesUsedToInferFacts: AccessedRemoteFile[];
  }>
> => {
  const { url } = params;

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

  const { plan: initialPlan } = await createInitialPlan({
    input,
  });

  logger.debug(`Worker agent initial plan: ${initialPlan}`);

  const state: InferFactsFromWebPageWorkerAgentState = {
    currentPlan: initialPlan,
    previousCalls: [],
    inferredFactsAboutEntities: [],
    inferredFacts: [],
    inferredFactsFromWebPageUrls: [],
    filesQueried: [],
    filesUsedToInferFacts: [],
  };

  const { userAuthentication } = await getFlowContext();

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

            const urlHeadFetch = await fetch(toolCallUrl, { method: "HEAD" });

            if (!urlHeadFetch.ok) {
              return {
                ...toolCall,
                output: `Failed to fetch the page at the provided URL: ${toolCallUrl}`,
                isError: true,
              };
            }

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
          } else if (
            toolCall.name === "inferFactsFromWebPage" ||
            toolCall.name === "inferFactsFromText"
          ) {
            const toolCallInput = toolCall.input as ToolCallArguments[
              | "inferFactsFromWebPage"
              | "inferFactsFromText"];

            const accessedRemoteFile =
              "fileUrl" in toolCallInput
                ? state.filesQueried.find(
                    ({ url: previouslyQueriedFileUrl }) =>
                      previouslyQueriedFileUrl === toolCallInput.fileUrl,
                  )
                : undefined;

            if ("fileUrl" in toolCallInput && !accessedRemoteFile) {
              return {
                ...toolCall,
                output: dedent(`
                  You did not previously query the PDF file at the provided fileUrl: ${toolCallInput.fileUrl}.
                  You must first query the PDF file with the relevant query using the "queryPdf" tool,
                    before inferring entities from its text content.
                `),
                isError: true,
              };
            }

            const {
              prompt: toolCallPrompt,
              // entityTypeIds: inferringEntitiesOfTypeIds,
              // linkEntityTypeIds: inferringLinkEntitiesOfTypeIds,
            } = toolCallInput;

            // if (
            //   "expectedNumberOfEntities" in toolCallInput &&
            //   toolCallInput.expectedNumberOfEntities < 1
            // ) {
            //   return {
            //     ...toolCall,
            //     output: dedent(`
            //       You provided an expected number of entities which is less than 1. You must provide
            //       a positive integer as the expected number of entities to infer.
            //     `),
            //     isError: true,
            //   };
            // }

            // const validEntityTypeIds = input.entityTypes.map(({ $id }) => $id);

            // const invalidEntityTypeIds = inferringEntitiesOfTypeIds.filter(
            //   (entityTypeId) => !validEntityTypeIds.includes(entityTypeId),
            // );

            // const validLinkEntityTypeIds = input.linkEntityTypes?.map(
            //   ({ $id }) => $id,
            // );

            // const invalidLinkEntityTypeIds =
            //   inferringLinkEntitiesOfTypeIds.filter(
            //     (entityTypeId) =>
            //       !validLinkEntityTypeIds?.includes(entityTypeId),
            //   );

            // if (
            //   invalidEntityTypeIds.length > 0 ||
            //   invalidLinkEntityTypeIds.length > 0
            // ) {
            //   return {
            //     ...toolCall,
            //     output: dedent(`
            //       ${
            //         invalidEntityTypeIds.length > 0
            //           ? dedent(`
            //             You provided invalid entityTypeIds which don't correspond to the entity types
            //             which were initially provided: ${JSON.stringify(invalidEntityTypeIds)}

            //             The possible entity types you can submit are: ${JSON.stringify(
            //               validEntityTypeIds,
            //             )}
            //           `)
            //           : ""
            //       }
            //       ${
            //         invalidLinkEntityTypeIds.length > 0
            //           ? dedent(`
            //             You provided invalid linkEntityTypeIds which don't correspond to the link entity types
            //             which were initially provided: ${JSON.stringify(invalidLinkEntityTypeIds)}

            //             The possible link entity types you can submit are: ${JSON.stringify(
            //               validLinkEntityTypeIds,
            //             )}
            //           `)
            //           : ""
            //       }
            //     `),
            //     isError: true,
            //   };
            // }

            if ("text" in toolCallInput && toolCallInput.text.length === 0) {
              return {
                ...toolCall,
                output: dedent(`
                  You provided an empty string as the ${"htmlContent" in toolCallInput ? "htmlContent from the web page" : "text"}.
                  You must provide ${"htmlContent" in toolCallInput ? "the relevant HTML content from the web page" : "text content"} to infer entities from.
                `),
                isError: true,
              };
            }

            if ("url" in toolCallInput) {
              state.inferredFactsFromWebPageUrls.push(toolCallInput.url);
            }

            let content = "";

            if ("text" in toolCallInput) {
              /**
               * @todo: consider prepending additional contextual information about the PDF file
               */
              content = dedent(`
                The following text content is a snippet of a PDF file hosted at the URL "${toolCallInput.fileUrl}".
                ---------------- START OF TEXT SNIPPET ----------------
                ${toolCallInput.text}
                ---------------- END OF TEXT SNIPPET ----------------
                
              `);
            } else {
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
            }

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

            const factSource: SourceProvenance =
              "url" in toolCallInput
                ? {
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
                  }
                : {
                    type: SourceType.Document,
                    location: {
                      uri: toolCallInput.fileUrl,
                      /** @todo H-2728 get the AI to infer these from the doc */
                      name: undefined,
                      description: undefined,
                    },
                    loadedAt: accessedRemoteFile?.loadedAt,
                    /** @todo H-2728 get the AI to infer these from the doc */
                    authors: undefined,
                    firstPublished: undefined,
                    lastUpdated: undefined,
                  };

            const inferredFactsWithSource = inferredFacts.map((fact) => ({
              ...fact,
              sources: [...(fact.sources ?? []), factSource],
            }));

            /**
             * @todo: deduplicate the entity summaries from previously obtained
             * entity summaries.
             */

            state.inferredFacts.push(...inferredFactsWithSource);
            state.inferredFactsAboutEntities.push(...entitySummaries);

            if (
              "fileUrl" in toolCallInput &&
              !state.filesUsedToInferFacts.some(
                ({ url: previousFileUsedToProposeEntitiesUrl }) =>
                  previousFileUsedToProposeEntitiesUrl ===
                  toolCallInput.fileUrl,
              )
            ) {
              state.filesUsedToInferFacts.push(accessedRemoteFile!);
            }

            // if (
            //   "expectedNumberOfEntities" in toolCallInput &&
            //   entitySummaries.length !==
            //     toolCallInput.expectedNumberOfEntities
            // ) {
            //   return {
            //     ...toolCall,
            //     output: dedent(`
            //       The following entities were inferred from the provided HTML content: ${JSON.stringify(summarizedNewProposedEntities)}

            //       The number of entities inferred from the HTML content doesn't match the expected number of entities.
            //       Expected: ${toolCallInput.expectedNumberOfEntities}
            //       Actual: ${entitySummaries.length}

            //       If there are missing entities which you require, you must make another "inferFactsFromWebPage" tool call
            //         with the relevant HTML content to try again.
            //     `),
            //   };
            // }

            return {
              ...toolCall,
              output: dedent(`
                ${inferredFacts.length} facts were successfully inferred for the following entities: ${JSON.stringify(entitySummaries)}
              `),
            };
          } else if (toolCall.name === "queryPdf") {
            return await handleQueryPdfToolCall({
              state,
              toolCall: toolCall as ParsedLlmToolCall<"queryPdf">,
            });
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

  return {
    code: StatusCode.Ok,
    contents: [
      {
        inferredFacts: state.inferredFacts,
        inferredFactsAboutEntities: state.inferredFactsAboutEntities,
        filesUsedToInferFacts: state.filesUsedToInferFacts,
      },
    ],
  };
};
