import type { VersionedUrl } from "@blockprotocol/type-system";
import type { Subtype } from "@local/advanced-types/subtype";
import { StatusCode } from "@local/status";
import dedent from "dedent";

import type { DereferencedEntityType } from "../../shared/dereference-entity-type";
import { getFlowContext } from "../../shared/get-flow-context";
import { getLlmResponse } from "../../shared/get-llm-response";
import type {
  LlmMessage,
  LlmMessageTextContent,
  LlmUserMessage,
} from "../../shared/get-llm-response/llm-message";
import { getToolCallsFromLlmAssistantMessage } from "../../shared/get-llm-response/llm-message";
import type {
  LlmParams,
  LlmToolDefinition,
  ParsedLlmToolCall,
} from "../../shared/get-llm-response/types";
import { graphApiClient } from "../../shared/graph-api-client";
import { stringify } from "../../shared/stringify";
import type { LocalEntitySummary } from "../shared/infer-facts-from-text/get-entity-summaries-from-text";
import type { Fact } from "../shared/infer-facts-from-text/types";
import type {
  CoordinatorToolCallArguments,
  CoordinatorToolName,
} from "./coordinator-tools";
import { generateToolDefinitions as generateCoordinatorToolDefinitions } from "./coordinator-tools";
import type { DuplicateReport } from "./deduplicate-entities";
import { deduplicateEntities } from "./deduplicate-entities";
import { generatePreviouslyInferredFactsSystemPromptMessage } from "./generate-previously-inferred-facts-system-prompt-message";
import { handleWebSearchToolCall } from "./handle-web-search-tool-call";
import { inferFactsFromWebPageWorkerAgent } from "./infer-facts-from-web-page-worker-agent";
import type { AccessedRemoteFile } from "./infer-facts-from-web-page-worker-agent/types";
import { simplifyEntityTypeForLlmConsumption } from "./shared/simplify-for-llm-consumption";
import type { CompletedToolCall } from "./types";
import { mapPreviousCallsToLlmMessages } from "./util";

const model: LlmParams["model"] = "claude-3-5-sonnet-20240620";

const omittedCoordinatorToolNames = [
  "complete",
  "startFactGatheringSubTasks",
  "requestHumanInput",
  "terminate",
] as const;

type OmittedCoordinatorToolNames = Subtype<
  CoordinatorToolName,
  (typeof omittedCoordinatorToolNames)[number]
>;

const subTaskAgentCustomToolNames = ["complete", "terminate"] as const;

type SubTaskAgentCustomToolName = (typeof subTaskAgentCustomToolNames)[number];

type SubTaskAgentToolName =
  | Exclude<CoordinatorToolName, OmittedCoordinatorToolNames>
  | SubTaskAgentCustomToolName;

const generateToolDefinitions = <
  T extends SubTaskAgentCustomToolName[],
>(params: {
  omitTools: T;
}): Record<
  Exclude<SubTaskAgentToolName, T[number]>,
  LlmToolDefinition<Exclude<SubTaskAgentToolName, T[number]>>
> => {
  const coordinatorToolDefinitions = generateCoordinatorToolDefinitions({
    omitTools: omittedCoordinatorToolNames.concat(),
  });

  const allToolDefinitions = {
    ...coordinatorToolDefinitions,
    terminate: {
      name: "terminate",
      description:
        "Terminate the sub-task, because you cannot find the required information to complete it.",
      inputSchema: {
        type: "object",
        properties: {
          reason: {
            type: "string",
            description: "The reason for terminating the sub-task.",
          },
        },
        required: ["reason"],
      },
    },
    complete: {
      name: "complete",
      description: "Complete the sub-task.",
      inputSchema: {
        type: "object",
        properties: {
          explanation: {
            type: "string",
            description:
              "The explanation for how the gathered facts satisfy sub-task.",
          },
        },
      },
    },
  };

  const filteredToolDefinitions = Object.fromEntries(
    Object.entries(allToolDefinitions).filter(
      ([toolName]) => !params.omitTools.includes(toolName as T[number]),
    ),
  ) as Record<
    Exclude<SubTaskAgentToolName, T[number]>,
    LlmToolDefinition<Exclude<SubTaskAgentToolName, T[number]>>
  >;

  return filteredToolDefinitions;
};

export type SubTaskAgentToolCallArguments = Subtype<
  Record<SubTaskAgentToolName, unknown>,
  {
    complete: {
      explanation: string;
    };
    terminate: {
      reason: string;
    };
  } & Omit<CoordinatorToolCallArguments, OmittedCoordinatorToolNames>
>;

const generateSystemPromptPrefix = (params: { input: SubTaskAgentInput }) => {
  const {
    relevantEntities,
    existingFactsAboutRelevantEntities,
    linkEntityTypes,
  } = params.input;

  return dedent(`
    You are a sub-task agent for a research task.

    The user will provide you with:
      - Goal: the research goal you need to satisfy to complete the research task
      - Entity Types: a list of entity types of the entities that you may need to discover facts about
      ${
        linkEntityTypes
          ? `- Link Entity Types: a list of link entity types of the entities that you may need to discover facts about`
          : ""
      }
      ${
        relevantEntities.length > 0
          ? `- Relevant Entities: a list entities which have already been discovered and may be relevant to the research goal`
          : ""
      }
      ${
        existingFactsAboutRelevantEntities.length > 0
          ? `- Existing Facts About Relevant Entities: a list of facts that have already been discovered about the relevant entities`
          : ""
      }

    The user will provide you with a research goal, and you are tasked with
      finding the facts with the provided tools to satisfy the research goal.

    The "complete" tool for completing the research task will only be available once you have obtained
      facts that satisfy the research goal.
  `);
};

export type SubTaskAgentInput = {
  goal: string;
  relevantEntities: LocalEntitySummary[];
  existingFactsAboutRelevantEntities: Fact[];
  entityTypes: DereferencedEntityType[];
  linkEntityTypes?: DereferencedEntityType[];
};

export type SubTaskAgentState = {
  plan: string;
  entitySummaries: LocalEntitySummary[];
  inferredFacts: Fact[];
  previousCalls: {
    completedToolCalls: CompletedToolCall<SubTaskAgentToolName>[];
  }[];
  filesUsedToInferFacts: AccessedRemoteFile[];
};

const generateInitialUserMessage = (params: {
  input: SubTaskAgentInput;
}): LlmUserMessage => {
  const {
    goal,
    relevantEntities,
    existingFactsAboutRelevantEntities,
    entityTypes,
    linkEntityTypes,
  } = params.input;

  return {
    role: "user",
    content: [
      {
        type: "text",
        text: dedent(`
Goal: ${goal}
Entity Types:
${entityTypes
  .map((entityType) => simplifyEntityTypeForLlmConsumption({ entityType }))
  .join("\n")}
${linkEntityTypes ? `Link Types: ${JSON.stringify(linkEntityTypes)}` : ""}
${
  relevantEntities.length > 0
    ? `Relevant Entities: ${JSON.stringify(relevantEntities)}`
    : ""
}
${
  existingFactsAboutRelevantEntities.length > 0
    ? `Existing Facts About Relevant Entities: ${JSON.stringify(
        existingFactsAboutRelevantEntities,
      )}`
    : ""
}
      `),
      },
    ],
  };
};

const createInitialPlan = async (params: {
  input: SubTaskAgentInput;
}): Promise<{ initialPlan: string }> => {
  const { input } = params;
  const systemPrompt = dedent(`
    ${generateSystemPromptPrefix({ input })}

    You must now provide a plan with the "updatePlan" tool of how you will use the tools to progress towards completing the task, which should be a list of steps in plain English.
    Do not make any other tool calls.
  `);

  const { userAuthentication, flowEntityId, stepId, webId } =
    await getFlowContext();

  const tools = Object.values(
    generateToolDefinitions({
      omitTools: ["complete"],
    }),
  );

  const llmResponse = await getLlmResponse(
    {
      systemPrompt,
      messages: [generateInitialUserMessage({ input })],
      model,
      tools,
      toolChoice: "updatePlan" satisfies SubTaskAgentToolName,
    },
    {
      customMetadata: {
        stepId,
        taskName: "subtask",
      },
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

  const updatePlanToolCall = toolCalls.find(
    (toolCall) => toolCall.name === "updatePlan",
  );

  if (updatePlanToolCall) {
    const { plan } =
      updatePlanToolCall.input as SubTaskAgentToolCallArguments["updatePlan"];

    return { initialPlan: plan };
  }

  throw new Error(
    `Could not find "updatePlan" tool call in LLM response: ${JSON.stringify(
      llmResponse,
    )}`,
  );
};

const generateProgressReport = (params: {
  input: SubTaskAgentInput;
  state: SubTaskAgentState;
}): LlmMessageTextContent => {
  const { state } = params;

  return {
    type: "text",
    text: dedent(`
      Here is a summary of the progress you've made so far.

      ${generatePreviouslyInferredFactsSystemPromptMessage(state)}

      You have previously proposed the following plan:
      ${state.plan}

      If you want to deviate from this plan or improve it, update it using the "updatePlan" tool.
      You must call the "updatePlan" tool alongside other tool calls to progress towards completing the task.
    `),
  };
};

const getNextToolCalls = async (params: {
  input: SubTaskAgentInput;
  state: SubTaskAgentState;
}): Promise<{
  toolCalls: ParsedLlmToolCall<SubTaskAgentToolName>[];
}> => {
  const { input, state } = params;

  const systemPrompt = dedent(`
      ${generateSystemPromptPrefix({ input })}
      
      Make as many tool calls as are required to progress towards completing the task.
    `);

  const llmMessagesFromPreviousToolCalls = mapPreviousCallsToLlmMessages({
    previousCalls: state.previousCalls,
  });

  const lastUserMessage = llmMessagesFromPreviousToolCalls.slice(-1)[0];

  if (lastUserMessage && lastUserMessage.role !== "user") {
    throw new Error(
      `Expected last message to be a user message, but it was: ${stringify(
        lastUserMessage,
      )}`,
    );
  }

  const progressReport = generateProgressReport({ input, state });

  const messages: LlmMessage[] = [
    generateInitialUserMessage({ input }),
    ...llmMessagesFromPreviousToolCalls.slice(0, -1),
    lastUserMessage
      ? ({
          ...lastUserMessage,
          content: [
            ...lastUserMessage.content,
            // Add the progress report to the most recent user message.
            progressReport,
          ],
        } satisfies LlmUserMessage)
      : [],
  ].flat();

  const tools = Object.values(
    generateToolDefinitions({
      omitTools: [
        ...(state.inferredFacts.length > 0 ? [] : ["complete" as const]),
      ],
    }),
  );

  const { userAuthentication, flowEntityId, stepId, webId } =
    await getFlowContext();

  const llmResponse = await getLlmResponse(
    {
      systemPrompt,
      messages,
      model,
      tools,
      toolChoice: "required",
    },
    {
      customMetadata: {
        stepId,
        taskName: "subtask",
      },
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

export const runSubTaskAgent = async (params: {
  input: SubTaskAgentInput;
  testingParams?: {
    persistState: (state: SubTaskAgentState) => void;
    resumeFromState?: SubTaskAgentState;
  };
}): Promise<
  | {
      status: "ok";
      explanation: string;
      filesUsedToInferFacts: AccessedRemoteFile[];
      discoveredEntities: LocalEntitySummary[];
      discoveredFacts: Fact[];
    }
  | {
      status: "terminated";
      reason: string;
      filesUsedToInferFacts: AccessedRemoteFile[];
      discoveredEntities: LocalEntitySummary[];
      discoveredFacts: Fact[];
    }
> => {
  const { testingParams, input } = params;

  let state: SubTaskAgentState;

  if (testingParams?.resumeFromState) {
    state = testingParams.resumeFromState;
  } else {
    const { initialPlan } = await createInitialPlan({ input });

    state = {
      plan: initialPlan,
      inferredFacts: [],
      entitySummaries: [],
      previousCalls: [],
      filesUsedToInferFacts: [],
    };
  }

  const { toolCalls: initialToolCalls } = await getNextToolCalls({
    input,
    state,
  });

  const processToolCalls = async (processToolCallsParams: {
    toolCalls: ParsedLlmToolCall<SubTaskAgentToolName>[];
  }): Promise<
    | {
        status: "ok";
        explanation: string;
      }
    | {
        status: "terminated";
        reason: string;
      }
  > => {
    const { toolCalls } = processToolCallsParams;

    const terminateToolCall = toolCalls.find(
      (toolCall) => toolCall.name === "terminate",
    );

    if (terminateToolCall) {
      const { reason } =
        terminateToolCall.input as SubTaskAgentToolCallArguments["terminate"];

      return { status: "terminated", reason };
    }

    const completedToolCalls = await Promise.all(
      toolCalls
        .filter(({ name }) => name !== "complete")
        .map(
          async (
            toolCall,
          ): Promise<CompletedToolCall<SubTaskAgentToolName>> => {
            if (toolCall.name === "updatePlan") {
              const { plan } =
                toolCall.input as SubTaskAgentToolCallArguments["updatePlan"];

              state.plan = plan;

              return {
                ...toolCall,
                output: `The plan has been successfully updated.`,
              };
            } else if (toolCall.name === "webSearch") {
              const webPageSummaries = await handleWebSearchToolCall({
                input:
                  toolCall.input as SubTaskAgentToolCallArguments["webSearch"],
              });

              const output = webPageSummaries
                .map(
                  ({ url, summary }, index) => `
-------------------- SEARCH RESULT ${index + 1} --------------------
URL: ${url}
Summary: ${summary}`,
                )
                .join("\n");

              return {
                ...toolCall,
                output,
              };
            } else if (toolCall.name === "inferFactsFromWebPages") {
              const { webPages } =
                toolCall.input as CoordinatorToolCallArguments["inferFactsFromWebPages"];

              const validEntityTypeIds = input.entityTypes.map(
                ({ $id }) => $id,
              );

              const invalidEntityTypeIds = webPages
                .flatMap(({ entityTypeIds }) => entityTypeIds)
                .filter(
                  (entityTypeId) =>
                    !validEntityTypeIds.includes(entityTypeId as VersionedUrl),
                );

              const validLinkEntityTypeIds =
                input.linkEntityTypes?.map(({ $id }) => $id) ?? [];

              const invalidLinkEntityTypeIds = webPages
                .flatMap(({ linkEntityTypeIds }) => linkEntityTypeIds ?? [])
                .filter(
                  (entityTypeId) =>
                    !validLinkEntityTypeIds.includes(
                      entityTypeId as VersionedUrl,
                    ),
                );

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

                        Valid entity type IDs are: ${JSON.stringify(
                          validEntityTypeIds,
                        )}
                      `)
                      : ""
                  }
                  ${
                    invalidLinkEntityTypeIds.length > 0
                      ? dedent(`
                        The following link entity type IDs are invalid: ${JSON.stringify(
                          invalidLinkEntityTypeIds,
                        )}
                        
                        The valid link entity types type IDs are: ${JSON.stringify(
                          validLinkEntityTypeIds,
                        )}
                      `)
                      : ""
                  }

                `),
                  isError: true,
                };
              }

              const statusesWithUrl = await Promise.all(
                webPages.map(
                  async ({ url, prompt, entityTypeIds, linkEntityTypeIds }) => {
                    const status = await inferFactsFromWebPageWorkerAgent({
                      prompt,
                      entityTypes: input.entityTypes.filter(({ $id }) =>
                        entityTypeIds.includes($id),
                      ),
                      linkEntityTypes: input.linkEntityTypes?.filter(
                        ({ $id }) => linkEntityTypeIds?.includes($id) ?? false,
                      ),
                      url,
                    });

                    return { status, url };
                  },
                ),
              );

              let outputMessage = "";

              const inferredFacts: Fact[] = [];
              const entitySummaries: LocalEntitySummary[] = [];
              const filesUsedToInferFacts: AccessedRemoteFile[] = [];

              for (const { status, url } of statusesWithUrl) {
                if (status.code !== StatusCode.Ok) {
                  outputMessage += `An error occurred when inferring facts from the web page with url ${url}: ${status.message}\n`;

                  continue;
                }

                const content = status.contents[0]!;

                inferredFacts.push(...content.inferredFacts);
                entitySummaries.push(...content.entitySummaries);
                filesUsedToInferFacts.push(...content.filesUsedToInferFacts);

                outputMessage += `Inferred ${
                  content.inferredFacts.length
                } facts on the web page with url ${url} for the following entities: ${stringify(
                  content.entitySummaries.map(({ name, summary }) => ({
                    name,
                    summary,
                  })),
                )}. ${content.suggestionForNextSteps}\n`;
              }

              /**
               * @todo: deduplicate the entity summaries from existing entities provided as input.
               */

              if (entitySummaries.length > 0) {
                const { duplicates } = await deduplicateEntities({
                  entities: [
                    ...input.relevantEntities,
                    ...entitySummaries,
                    ...state.entitySummaries,
                  ],
                });

                const existingEntityIds = input.relevantEntities.map(
                  ({ localId }) => localId,
                );

                const adjustedDuplicates = duplicates.map<DuplicateReport>(
                  ({ canonicalId, duplicateIds }) => {
                    if (existingEntityIds.includes(canonicalId)) {
                      return { canonicalId, duplicateIds };
                    }

                    const existingEntityIdMarkedAsDuplicate = duplicateIds.find(
                      (id) => existingEntityIds.includes(id),
                    );

                    /**
                     * @todo: this doesn't account for when there are duplicates
                     * detected in the input relevant entities.
                     */
                    if (existingEntityIdMarkedAsDuplicate) {
                      return {
                        canonicalId: existingEntityIdMarkedAsDuplicate,
                        duplicateIds: [
                          ...duplicateIds.filter(
                            (id) => id !== existingEntityIdMarkedAsDuplicate,
                          ),
                          canonicalId,
                        ],
                      };
                    }

                    return { canonicalId, duplicateIds };
                  },
                );

                const inferredFactsWithDeduplicatedEntities = inferredFacts.map(
                  (fact) => {
                    const { subjectEntityLocalId, objectEntityLocalId } = fact;
                    const subjectDuplicate = adjustedDuplicates.find(
                      ({ duplicateIds }) =>
                        duplicateIds.includes(subjectEntityLocalId),
                    );

                    const objectDuplicate = objectEntityLocalId
                      ? duplicates.find(({ duplicateIds }) =>
                          duplicateIds.includes(objectEntityLocalId),
                        )
                      : undefined;

                    return {
                      ...fact,
                      subjectEntityLocalId:
                        subjectDuplicate?.canonicalId ??
                        fact.subjectEntityLocalId,
                      objectEntityLocalId:
                        objectDuplicate?.canonicalId ?? objectEntityLocalId,
                    };
                  },
                );

                state.inferredFacts.push(
                  ...inferredFactsWithDeduplicatedEntities,
                );
                state.entitySummaries = [
                  ...state.entitySummaries,
                  ...entitySummaries,
                ].filter(
                  ({ localId }) =>
                    !duplicates.some(({ duplicateIds }) =>
                      duplicateIds.includes(localId),
                    ),
                );

                state.filesUsedToInferFacts.push(...filesUsedToInferFacts);

                return {
                  ...toolCall,
                  output: outputMessage,
                };
              }

              return {
                ...toolCall,
                output: "No facts were inferred about any relevant entities.",
              };
            }

            throw new Error(`Unexpected tool call: ${stringify(toolCall)}`);
          },
        ),
    );

    const completeToolCall = toolCalls.find(
      (toolCall) => toolCall.name === "complete",
    );

    state.previousCalls = [...state.previousCalls, { completedToolCalls }];

    if (testingParams?.persistState) {
      testingParams.persistState(state);
    }

    if (completeToolCall) {
      const { explanation } =
        completeToolCall.input as SubTaskAgentToolCallArguments["complete"];

      return { status: "ok", explanation };
    }

    const { toolCalls: nextToolCalls } = await getNextToolCalls({
      input,
      state,
    });

    return processToolCalls({ toolCalls: nextToolCalls });
  };

  const result = await processToolCalls({ toolCalls: initialToolCalls });

  return {
    ...result,
    filesUsedToInferFacts: state.filesUsedToInferFacts,
    discoveredEntities: state.entitySummaries,
    discoveredFacts: state.inferredFacts,
  };
};
