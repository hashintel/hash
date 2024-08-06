import type { VersionedUrl } from "@blockprotocol/type-system";
import type { Subtype } from "@local/advanced-types/subtype";
import type {
  FlowDataSources,
  WorkerIdentifiers,
} from "@local/hash-isomorphic-utils/flows/types";
import { generateUuid } from "@local/hash-isomorphic-utils/generate-uuid";
import dedent from "dedent";

import type { DereferencedEntityType } from "../../shared/dereference-entity-type.js";
import { getFlowContext } from "../../shared/get-flow-context.js";
import { getLlmResponse } from "../../shared/get-llm-response.js";
import type {
  LlmMessage,
  LlmMessageTextContent,
  LlmUserMessage,
} from "../../shared/get-llm-response/llm-message.js";
import { getToolCallsFromLlmAssistantMessage } from "../../shared/get-llm-response/llm-message.js";
import type {
  LlmParams,
  LlmToolDefinition,
  ParsedLlmToolCall,
} from "../../shared/get-llm-response/types.js";
import { graphApiClient } from "../../shared/graph-api-client.js";
import { logProgress } from "../../shared/log-progress.js";
import { stringify } from "../../shared/stringify.js";
import type { LocalEntitySummary } from "../shared/infer-claims-from-text/get-entity-summaries-from-text.js";
import type { Claim } from "../shared/infer-claims-from-text/types.js";
import type { CoordinatingAgentState } from "./coordinating-agent.js";
import type {
  CoordinatorToolCallArguments,
  CoordinatorToolName,
} from "./coordinator-tools.js";
import { generateToolDefinitions as generateCoordinatorToolDefinitions } from "./coordinator-tools.js";
import type { DuplicateReport } from "./deduplicate-entities.js";
import { deduplicateEntities } from "./deduplicate-entities.js";
import { handleWebSearchToolCall } from "./handle-web-search-tool-call.js";
import { linkFollowerAgent } from "./link-follower-agent.js";
import {
  simplifyClaimForLlmConsumption,
  simplifyEntityTypeForLlmConsumption,
} from "./shared/simplify-for-llm-consumption.js";
import type { CompletedCoordinatorToolCall } from "./types.js";
import { nullReturns } from "./types.js";
import { mapPreviousCallsToLlmMessages } from "./util.js";

const model: LlmParams["model"] = "claude-3-5-sonnet-20240620";

const omittedCoordinatorToolNames = [
  "complete",
  "startClaimGatheringSubTasks",
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
  dataSources: FlowDataSources;
  omitTools: T;
}): Record<
  Exclude<SubTaskAgentToolName, T[number]>,
  LlmToolDefinition<Exclude<SubTaskAgentToolName, T[number]>>
> => {
  const coordinatorToolDefinitions = generateCoordinatorToolDefinitions({
    dataSources: params.dataSources,
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
              "The explanation for how the gathered claims satisfy sub-task.",
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
    existingClaimsAboutRelevantEntities,
    linkEntityTypes,
  } = params.input;

  return dedent(`
    You are a sub-task agent for a research task.

    The user will provide you with:
      - Goal: the research goal you need to satisfy to complete the research task
      - Entity Types: a list of entity types of the entities that you may need to discover claims about
      ${
        linkEntityTypes
          ? `- Link Entity Types: a list of link entity types of the entities that you may need to discover claims about`
          : ""
      }
      ${
        relevantEntities.length > 0
          ? `- Relevant Entities: a list entities which have already been discovered and may be relevant to the research goal. Check this list before making any web searches to discover entities mentioned in the research goal – they may already be provided here.`
          : ""
      }
      ${
        existingClaimsAboutRelevantEntities.length > 0
          ? `- Existing Claims About Relevant Entities: a list of claims that have already been discovered about the relevant entities`
          : ""
      }

    You are tasked with finding the claims with the provided tools to satisfy the research goal.
    
    The user will also provide you with a progress report of the information discovered and work done to date.
    Take account of this when deciding your next action.

    The "complete" tool should be used once you have gathered sufficient claims to satisfy the research goal.
  `);
};

export type SubTaskAgentInput = {
  goal: string;
  relevantEntities: LocalEntitySummary[];
  existingClaimsAboutRelevantEntities: Claim[];
  entityTypes: DereferencedEntityType[];
  linkEntityTypes?: DereferencedEntityType[];
};

export type SubTaskAgentState = Pick<
  CoordinatingAgentState,
  | "plan"
  | "entitySummaries"
  | "inferredClaims"
  | "resourcesNotVisited"
  | "resourceUrlsVisited"
  | "webQueriesMade"
> & {
  previousCalls: {
    completedToolCalls: CompletedCoordinatorToolCall<SubTaskAgentToolName>[];
  }[];
};

const generateInitialUserMessage = (params: {
  input: SubTaskAgentInput;
}): LlmUserMessage => {
  const {
    goal,
    relevantEntities,
    existingClaimsAboutRelevantEntities,
    entityTypes,
    linkEntityTypes,
  } = params.input;

  return {
    role: "user",
    content: [
      {
        type: "text",
        text: dedent(`
<Goal>${goal}</Goal>
<EntityTypes>
${entityTypes
  .map((entityType) => simplifyEntityTypeForLlmConsumption({ entityType }))
  .join("\n")}
</EntityTypes>
${linkEntityTypes ? `<LinkTypes>${linkEntityTypes.map((linkType) => simplifyEntityTypeForLlmConsumption({ entityType: linkType })).join("\n")}</LinkTypes>` : ""}
${
  relevantEntities.length > 0
    ? `<RelevantEntities>${relevantEntities
        .map(({ localId, name, summary, entityTypeId }) => {
          const claimsAboutEntity = existingClaimsAboutRelevantEntities.filter(
            (claim) => claim.subjectEntityLocalId === localId,
          );

          return dedent(`
          <Entity>
            Name: ${name}
            Summary: ${summary}
            EntityType: ${entityTypeId}
            Claims known at start of task: ${claimsAboutEntity.map((claim) => `<Claim>${simplifyClaimForLlmConsumption(claim)}</Claim>`).join("\n")}
          </Entity>`);
        })
        .join("\n")}</RelevantEntities>`
    : ""
}`),
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

  const { dataSources, userAuthentication, flowEntityId, stepId, webId } =
    await getFlowContext();

  const tools = Object.values(
    generateToolDefinitions({
      dataSources,
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

  const {
    entitySummaries,
    inferredClaims,
    webQueriesMade,
    resourcesNotVisited,
    resourceUrlsVisited,
  } = state;

  let text = dedent(`
      You have previously proposed the following plan:
      ${state.plan}

      If you want to deviate from this plan or improve it, update it using the "updatePlan" tool.
      You must call the "updatePlan" tool alongside other tool calls to progress towards completing the task.
      
      You don't need to complete all the steps in the plan if you feel the claims you have already gathered are sufficient to meet the research goal – call complete if they are, with an explanation as to why they are sufficient.
    `);

  if (inferredClaims.length > 0) {
    text += dedent(`
      Here's the information about entities we've gathered so far:
      <Entities>${entitySummaries
        .map(({ localId, name, summary, entityTypeId }) => {
          const claimsAboutEntity = inferredClaims.filter(
            (claim) => claim.subjectEntityLocalId === localId,
          );

          return dedent(`<Entity>
    Name: ${name}
    Summary: ${summary}
    EntityType: ${entityTypeId}
    Claims: ${claimsAboutEntity.map((claim) => `<Claim>${simplifyClaimForLlmConsumption(claim)}</Claim>`).join("\n")}
    </Entity>`);
        })
        .join("\n")}</Entities>
    `);
  }

  if (resourceUrlsVisited.length > 0) {
    text += dedent(`
        You have already visited the following resources – do not visit them again. They are included for your reference for work done only:
        <ResourcesVisited>
          ${resourceUrlsVisited.map((resourceUrl) => `<ResourceVisited>${resourceUrl}</ResourceVisited>`).join("\n")}
        </ResourcesVisited>
      `);
  }
  if (resourcesNotVisited.length > 0) {
    text += dedent(`
        You have discovered the following resources via web searches but noy yet visited them. It may be worth inferring claims from the URL.
        <ResourcesNotVisited>
        ${resourcesNotVisited
          .map(
            (webPage) =>
              `
<Resource>
  <Url>${webPage.url}</Url>
  <Summary>${webPage.summary}</Summary>
  <FromWebSearch>"${webPage.fromSearchQuery}"</FromWebSearch>
</Resource>`,
          )
          .join("\n")}
        </ResourcesNotVisited>
      `);
  }
  if (webQueriesMade.length > 0) {
    text += dedent(`
        You have made the following web searches – there is no point in making these or very similar searches again:
        <WebSearchesMade>
        ${webQueriesMade.join("\n")}
        </WebSearchesMade>
      `);
  }

  text +=
    "Now decide what to do next – if you have already sufficient information to complete the task, call 'complete'.";

  return {
    type: "text",
    text,
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

  const userMessage = generateInitialUserMessage({ input });

  userMessage.content.push(progressReport);

  const messages: LlmMessage[] = [userMessage];

  const { dataSources, userAuthentication, flowEntityId, stepId, webId } =
    await getFlowContext();

  const tools = Object.values(
    generateToolDefinitions({
      dataSources,
      omitTools: [
        ...(state.inferredClaims.length > 0 ? [] : ["complete" as const]),
      ],
    }),
  );

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
  workerIdentifiers: WorkerIdentifiers;
}): Promise<
  | {
      status: "ok";
      explanation: string;
      discoveredEntities: LocalEntitySummary[];
      discoveredClaims: Claim[];
    }
  | {
      status: "terminated";
      reason: string;
      discoveredEntities: LocalEntitySummary[];
      discoveredClaims: Claim[];
    }
> => {
  const { testingParams, input, workerIdentifiers } = params;

  const { stepId } = await getFlowContext();

  let state: SubTaskAgentState;

  if (testingParams?.resumeFromState) {
    state = testingParams.resumeFromState;
  } else {
    const { initialPlan } = await createInitialPlan({ input });

    state = {
      plan: initialPlan,
      inferredClaims: [],
      entitySummaries: [],
      previousCalls: [],
      webQueriesMade: [],
      resourcesNotVisited: [],
      resourceUrlsVisited: [],
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
          ): Promise<CompletedCoordinatorToolCall<SubTaskAgentToolName>> => {
            if (toolCall.name === "updatePlan") {
              const { plan } =
                toolCall.input as SubTaskAgentToolCallArguments["updatePlan"];

              state.plan = plan;

              return {
                ...toolCall,
                ...nullReturns,
                output: `The plan has been successfully updated.`,
              };
            } else if (toolCall.name === "webSearch") {
              const webPageSummaries = await handleWebSearchToolCall({
                input:
                  toolCall.input as SubTaskAgentToolCallArguments["webSearch"],
                workerIdentifiers,
              });

              if ("error" in webPageSummaries) {
                return {
                  ...toolCall,
                  ...nullReturns,
                  isError: true,
                  output: webPageSummaries.error,
                };
              }

              return {
                ...nullReturns,
                ...toolCall,
                output: "Search successful",
                webPagesFromSearchQuery: webPageSummaries,
              };
            } else if (toolCall.name === "inferClaimsFromResources") {
              const { resources } =
                toolCall.input as CoordinatorToolCallArguments["inferClaimsFromResources"];

              const validEntityTypeIds = input.entityTypes.map(
                ({ $id }) => $id,
              );

              const invalidEntityTypeIds = resources
                .flatMap(({ entityTypeIds }) => entityTypeIds)
                .filter(
                  (entityTypeId) =>
                    !validEntityTypeIds.includes(entityTypeId as VersionedUrl),
                );

              const validLinkEntityTypeIds =
                input.linkEntityTypes?.map(({ $id }) => $id) ?? [];

              const invalidLinkEntityTypeIds = resources
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
                  ...nullReturns,
                  isError: true,
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
                };
              }

              const responsesWithUrl = await Promise.all(
                resources.map(
                  async ({
                    url,
                    prompt,
                    entityTypeIds,
                    linkEntityTypeIds,
                    descriptionOfExpectedContent,
                    exampleOfExpectedContent,
                    reason,
                  }) => {
                    const linkFollowerInstanceId = generateUuid();

                    const linkFollowerIdentifiers: WorkerIdentifiers = {
                      workerType: "Link explorer",
                      parentInstanceId: workerIdentifiers.workerInstanceId,
                      workerInstanceId: linkFollowerInstanceId,
                    };

                    logProgress([
                      {
                        stepId,
                        recordedAt: new Date().toISOString(),
                        type: "StartedLinkExplorerTask",
                        input: {
                          goal: prompt,
                        },
                        explanation: reason,
                        ...linkFollowerIdentifiers,
                      },
                    ]);

                    const response = await linkFollowerAgent({
                      workerIdentifiers: linkFollowerIdentifiers,
                      input: {
                        existingEntitiesOfInterest: input.relevantEntities,
                        initialResource: {
                          url,
                          descriptionOfExpectedContent,
                          exampleOfExpectedContent,
                          reason,
                        },
                        task: prompt,
                        entityTypes: input.entityTypes.filter(
                          ({ $id }) =>
                            entityTypeIds.includes($id) ||
                            input.relevantEntities.some(
                              (entity) => entity.entityTypeId === $id,
                            ),
                        ),
                        linkEntityTypes: input.linkEntityTypes?.filter(
                          ({ $id }) =>
                            !!linkEntityTypeIds?.includes($id) ||
                            input.relevantEntities.some(
                              (entity) => entity.entityTypeId === $id,
                            ),
                        ),
                      },
                    });

                    logProgress([
                      {
                        stepId,
                        recordedAt: new Date().toISOString(),
                        type: "ClosedLinkExplorerTask",
                        goal: prompt,
                        output: {
                          claimCount: response.inferredClaims.length,
                          entityCount: response.inferredSummaries.length,
                          resourcesExploredCount:
                            response.exploredResources.length,
                          suggestionForNextSteps:
                            response.suggestionForNextSteps,
                        },
                        ...linkFollowerIdentifiers,
                      },
                    ]);

                    return { response, url };
                  },
                ),
              );

              const inferredClaims: Claim[] = [];
              const entitySummaries: LocalEntitySummary[] = [];
              const suggestionsForNextStepsMade: string[] = [];
              const resourceUrlsVisited: string[] = [];

              for (const { response } of responsesWithUrl) {
                inferredClaims.push(...response.inferredClaims);
                entitySummaries.push(...response.inferredSummaries);
                suggestionsForNextStepsMade.push(
                  response.suggestionForNextSteps,
                );
                resourceUrlsVisited.push(
                  ...response.exploredResources.map(({ url }) => url),
                );
              }

              return {
                ...toolCall,
                ...nullReturns,
                inferredClaims,
                entitySummaries,
                suggestionsForNextStepsMade,
                resourceUrlsVisited,
                output:
                  entitySummaries.length > 0
                    ? "Entities inferred from web page"
                    : "No claims were inferred about any relevant entities.",
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

    const resourceUrlsVisited = completedToolCalls.flatMap(
      ({ resourceUrlsVisited: urlsVisited }) => urlsVisited ?? [],
    );

    state.resourceUrlsVisited = [
      ...new Set([...resourceUrlsVisited, ...state.resourceUrlsVisited]),
    ];

    const newWebPages = completedToolCalls
      .flatMap(({ webPagesFromSearchQuery }) => webPagesFromSearchQuery ?? [])
      .filter(
        (webPage) =>
          !state.resourcesNotVisited.find((page) => page.url === webPage.url) &&
          !state.resourceUrlsVisited.includes(webPage.url),
      );

    state.resourcesNotVisited.push(...newWebPages);

    state.resourcesNotVisited = state.resourcesNotVisited.filter(
      ({ url }) => !state.resourceUrlsVisited.includes(url),
    );

    state.webQueriesMade.push(
      ...completedToolCalls.flatMap(
        ({ webQueriesMade }) => webQueriesMade ?? [],
      ),
    );

    const newEntitySummaries = completedToolCalls.flatMap(
      ({ entitySummaries }) => entitySummaries ?? [],
    );
    const newClaims = completedToolCalls.flatMap(
      ({ inferredClaims }) => inferredClaims ?? [],
    );

    state.inferredClaims = [...state.inferredClaims, ...newClaims];

    if (newEntitySummaries.length > 0) {
      const { duplicates } = await deduplicateEntities({
        entities: [
          ...input.relevantEntities,
          ...newEntitySummaries,
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

          const existingEntityIdMarkedAsDuplicate = duplicateIds.find((id) =>
            existingEntityIds.includes(id),
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

      const inferredClaimsWithDeduplicatedEntities = state.inferredClaims.map(
        (claim) => {
          const { subjectEntityLocalId, objectEntityLocalId } = claim;
          const subjectDuplicate = adjustedDuplicates.find(({ duplicateIds }) =>
            duplicateIds.includes(subjectEntityLocalId),
          );

          const objectDuplicate = objectEntityLocalId
            ? duplicates.find(({ duplicateIds }) =>
                duplicateIds.includes(objectEntityLocalId),
              )
            : undefined;

          return {
            ...claim,
            subjectEntityLocalId:
              subjectDuplicate?.canonicalId ?? claim.subjectEntityLocalId,
            objectEntityLocalId:
              objectDuplicate?.canonicalId ?? objectEntityLocalId,
          };
        },
      );

      state.inferredClaims.push(...inferredClaimsWithDeduplicatedEntities);
      state.entitySummaries = [
        ...state.entitySummaries,
        ...newEntitySummaries,
      ].filter(
        ({ localId }) =>
          !duplicates.some(({ duplicateIds }) =>
            duplicateIds.includes(localId),
          ),
      );
    }

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
    discoveredEntities: state.entitySummaries,
    discoveredClaims: state.inferredClaims,
  };
};
