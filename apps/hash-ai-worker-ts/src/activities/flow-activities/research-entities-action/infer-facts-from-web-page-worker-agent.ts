import type { VersionedUrl } from "@blockprotocol/type-system";
import type { OriginProvenance } from "@local/hash-graph-client";
import { SourceType } from "@local/hash-graph-client";
import type { ProposedEntity } from "@local/hash-isomorphic-utils/flows/types";
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
import { proposeEntitiesFromFacts } from "../shared/propose-entities-from-facts";
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

    Make as many different tool calls in parallel as possible. For example, call "inferEntitiesFromWebPage"
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

const getSubmittedProposedEntitiesFromState = (
  state: InferFactsFromWebPageWorkerAgentState,
): ProposedEntity[] =>
  state.proposedEntities.filter(({ localEntityId }) =>
    state.submittedEntityIds.includes(localEntityId),
  );

const getNextToolCalls = async (params: {
  input: InferFactsFromWebPageWorkerAgentInput;
  state: InferFactsFromWebPageWorkerAgentState;
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

      To constrain the size of the chat history, some message outputs may have been omitted.
      
      Here's a summary of what you've previously done:
        - You have previously inferred entities from the following webpages: ${JSON.stringify(state.inferredEntitiesFromWebPageUrls, null, 2)}
      ${
        submittedProposedEntities.length > 0
          ? dedent(`
            - You have previously submitted the following proposed entities: ${JSON.stringify(submittedProposedEntities.map(mapProposedEntityToSummarizedEntity))}

            If the submitted entities satisfy the research prompt, call the "complete" tool.
          `)
          : "- You have not previously submitted any facts about entities."
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
    inferredEntities: ProposedEntity[];
    filesUsedToProposeEntities: AccessedRemoteFile[];
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
    proposedEntities: [],
    submittedEntityIds: [],
    inferredEntitiesFromWebPageUrls: [],
    idCounter: 0,
    filesQueried: [],
    filesUsedToProposeEntities: [],
  };

  const { flowEntityId, stepId, userAuthentication } = await getFlowContext();

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
              If there are any entities in this HTML which you think are relevant to the task, you must
                immediately call the "inferEntitiesFromWebPage" tool with the relevant HTML content from the HTML.
              
              If there are any links in the HTML which may also contain relevant entities, you should
                make additional "getWebPageInnerHtml" tool calls to get the content of those pages.

              Note that you will only be able to see one HTML page at a time, so do not make a single "getWebPageInnerHtml"
                tool call unless there are no entities to infer from this page.
              `),
            };
          } else if (
            toolCall.name === "inferEntitiesFromWebPage" ||
            toolCall.name === "inferEntitiesFromText"
          ) {
            const toolCallInput = toolCall.input as ToolCallArguments[
              | "inferEntitiesFromWebPage"
              | "inferEntitiesFromText"];

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
              validAt,
              entityTypeIds: inferringEntitiesOfTypeIds,
              linkEntityTypeIds: inferringLinkEntitiesOfTypeIds,
            } = toolCallInput;

            if (
              "expectedNumberOfEntities" in toolCallInput &&
              toolCallInput.expectedNumberOfEntities < 1
            ) {
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

            if (
              "htmlContent" in toolCallInput
                ? toolCallInput.htmlContent.length === 0
                : toolCallInput.text.length === 0
            ) {
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
              state.inferredEntitiesFromWebPageUrls.push(toolCallInput.url);
            }

            const content = dedent(`
              ${"htmlContent" in toolCallInput ? toolCallInput.htmlContent : toolCallInput.text}
              The above data is valid at ${validAt}.
            `);

            const dereferencedEntityTypes =
              await getDereferencedEntityTypesActivity({
                entityTypeIds: [
                  ...inferringEntitiesOfTypeIds,
                  ...(inferringLinkEntitiesOfTypeIds ?? []),
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
            const { facts, entitySummaries } = await inferFactsFromText({
              text: content,
              dereferencedEntityTypes,
              relevantEntitiesPrompt: toolCallPrompt,
            });

            /**
             * @todo: instead of directly proposing entities from the facts, we should
             * pass the facts to the coordinator agent for collection/deduplication, so
             * that entities can be proposed from multiple sources.
             *
             * @see https://linear.app/hash/issue/H-2693/implement-fact-gathering-in-the-workercoordinator-agents-of-the
             */
            const { proposedEntities } = await proposeEntitiesFromFacts({
              entitySummaries,
              facts,
              dereferencedEntityTypes,
            });

            const editionProvenance: ProposedEntity["provenance"] = {
              actorType: "ai",
              // @ts-expect-error - `ProvidedEntityEditionProvenanceOrigin` is not being generated correctly from the Graph API
              origin: {
                type: "flow",
                id: flowEntityId,
                stepIds: [stepId],
              } satisfies OriginProvenance,
            };

            const propertyProvenance: NonNullable<
              ProposedEntity["propertyMetadata"]
            >[number]["metadata"]["provenance"] =
              "url" in toolCallInput
                ? {
                    sources: [
                      {
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
                      },
                    ],
                  }
                : {
                    sources: [
                      {
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
                      },
                    ],
                  };

            const newProposedEntities = proposedEntities.map(
              (proposedEntity) =>
                ({
                  ...proposedEntity,
                  provenance: editionProvenance,
                  propertyMetadata: Object.keys(proposedEntity.properties).map(
                    (propertyBaseUrl) => ({
                      path: [propertyBaseUrl],
                      metadata: {
                        provenance: propertyProvenance,
                      },
                    }),
                    {} as ProposedEntity["propertyMetadata"],
                  ),
                }) satisfies ProposedEntity,
            );

            state.proposedEntities.push(...newProposedEntities);

            if (
              "fileUrl" in toolCallInput &&
              !state.filesUsedToProposeEntities.some(
                ({ url: previousFileUsedToProposeEntitiesUrl }) =>
                  previousFileUsedToProposeEntitiesUrl ===
                  toolCallInput.fileUrl,
              )
            ) {
              state.filesUsedToProposeEntities.push(accessedRemoteFile!);
            }

            const summarizedNewProposedEntities = newProposedEntities.map(
              mapProposedEntityToSummarizedEntity,
            );

            if (
              "expectedNumberOfEntities" in toolCallInput &&
              newProposedEntities.length !==
                toolCallInput.expectedNumberOfEntities
            ) {
              return {
                ...toolCall,
                output: dedent(`
                  The following entities were inferred from the provided HTML content: ${JSON.stringify(summarizedNewProposedEntities)}

                  The number of entities inferred from the HTML content doesn't match the expected number of entities.
                  Expected: ${toolCallInput.expectedNumberOfEntities}
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

  const submittedProposedEntities =
    getSubmittedProposedEntitiesFromState(state);

  return {
    code: StatusCode.Ok,
    contents: [
      {
        inferredEntities: submittedProposedEntities,
        filesUsedToProposeEntities: state.filesUsedToProposeEntities,
      },
    ],
  };
};
