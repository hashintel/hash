import type { Subtype } from "@local/advanced-types/subtype";
import type {
  FlowDataSources,
  WorkerIdentifiers,
} from "@local/hash-isomorphic-utils/flows/types";
import { generateUuid } from "@local/hash-isomorphic-utils/generate-uuid";
import dedent from "dedent";

import { logger } from "../../../shared/activity-logger.js";
import { getFlowContext } from "../../../shared/get-flow-context.js";
import type {
  LlmToolDefinition,
  ParsedLlmToolCall,
} from "../../../shared/get-llm-response/types.js";
import { logProgress } from "../../../shared/log-progress.js";
import { stringify } from "../../../shared/stringify.js";
import type { LocalEntitySummary } from "../../shared/infer-summaries-then-claims-from-text/get-entity-summaries-from-text.js";
import type { Claim } from "../../shared/infer-summaries-then-claims-from-text/types.js";
import { getAnswersFromHuman } from "../get-answers-from-human.js";
import { linkFollowerAgent } from "../link-follower-agent.js";
import { runSubCoordinatingAgent } from "../sub-coordinating-agent.js";
import type { SubCoordinatingAgentInput } from "../sub-coordinating-agent/input.js";
import type { SubCoordinatingAgentState } from "../sub-coordinating-agent/state.js";
import type {
  ParsedSubCoordinatorToolCall,
  ParsedSubCoordinatorToolCallMap,
  SubCoordinatingAgentToolName,
} from "../sub-coordinating-agent/sub-coordinator-tools.js";
import type {
  CoordinatingAgentInput,
  CoordinatingAgentState,
} from "./coordinators.js";
import type { WebResourceSummary } from "./handle-web-search-tool-call.js";
import { handleWebSearchToolCall } from "./handle-web-search-tool-call.js";

export const coordinatorToolNames = [
  "complete",
  "delegateResearchTask",
  "inferClaimsFromResource",
  "requestHumanInput",
  "terminate",
  "updatePlan",
  "webSearch",
] as const;

export type CoordinatorToolName = (typeof coordinatorToolNames)[number];

const explanationDefinition = {
  type: "string",
  description: dedent(`
    An explanation of why this tool call is required to satisfy the task,
    and how it aligns with the current plan. If the plan needs to be modified,
    make a call to the "updatePlan" tool.
  `),
} as const;

export const generateToolDefinitions = <
  T extends CoordinatorToolName[],
>(params: {
  dataSources: FlowDataSources;
  omitTools?: T;
  state?: CoordinatingAgentState;
}): Record<
  Exclude<CoordinatorToolName, T[number]>,
  LlmToolDefinition<Exclude<CoordinatorToolName, T[number]>>
> => {
  const { internetAccess } = params.dataSources;

  const omitTools: CoordinatorToolName[] = params.omitTools ?? [];
  if (!internetAccess.enabled) {
    omitTools.push("webSearch");
  }

  const allToolDefinitions: Record<
    CoordinatorToolName,
    LlmToolDefinition<CoordinatorToolName>
  > = {
    requestHumanInput: {
      name: "requestHumanInput",
      description:
        "Ask the user questions to gather information required to complete the research task, which include clarifying the research brief, or asking for advice on how to proceed if difficulties are encountered.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          explanation: {
            type: "string",
            description:
              "An explanation of why human input is required to advance the research task, and how it will be used",
          },
          questions: {
            type: "array",
            items: {
              type: "string",
              description:
                "A question to help clarify or complete the research task",
            },
            description: "An array of questions to ask the user",
          },
        },
        required: ["explanation", "questions"],
      },
    },
    delegateResearchTask: {
      name: "delegateResearchTask",
      description: dedent(`
      Instruct a colleague to help you with a specific part of the research task.
      This is useful when the research task is complex and requires multiple people to work on different parts of it.
      
      Make sure that you take account of any information the user has provided you when instructing your colleague,
      including the original research brief and any subsequent clarifications. Pass this information on to your colleague
      as part of the instructions where it would be helpful.
      
      Where you are seeking additional information on specific entities, make sure to include their ids as relevantEntityIds     
    `),
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          relevantEntityIds: {
            type: "array",
            items: {
              type: "string",
            },
            description: dedent(`
                  The entityId of the proposed entities which the task is relevant to.
                  
                  ${
                    params.state?.entitySummaries.length
                      ? `The possible values are: ${params.state.entitySummaries
                          .map(({ localId }) => localId)
                          .join(", ")}`
                      : ""
                  }
                `),
          },
          goal: {
            type: "string",
            description: dedent(`
                  The goal of the task – detailed instructions to your colleague about what you are seeking.
                  It should explain:
                  1. What the goal of the task is and how it fits into the wider research task
                  2. If you are seeking more information on specific entities:
                    a. the names of the entities (their ids should be provided under relevantEntityIds)
                    b. what specific information you are seeking about them
                  
                  For example 
                  "Find the technical specifications of product X".
                  "Find the LinkedIn URL for person X"
                  "Find the release date, director and box office takings for movie X"
                `),
          },
          explanation: {
            type: "string",
            description: dedent(`
                  An explanation of why the task will advance the overall research task, and how it will be used.
                  This is for audit purposes only and will not be provided to your colleague.
                  Provide all information needed to complete the task in the 'goal' and 'relevantEntityIds' fields.
                `),
          },
        },
        required: ["goal", "explanation"],
      },
    },
    webSearch: {
      name: "webSearch",
      description:
        dedent(`Perform a web search via a web search engine, returning a list of URLs. 
        For best results, the query should be specific and concise.
        Bear in mind that all the information you require may not be available via a single web search 
        – if you have various attributes to gather about specific entities, it may be worth performing multiple searches
        for each entity, or for each entity's attribute, until you find suitable results.
        `),
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          query: {
            type: "string",
            description: "The web search query",
          },
          explanation: {
            type: "string",
            description:
              "An explanation of why the web search will advance the research task, and how it will be used",
          },
        },
        required: ["query", "explanation"],
      },
    },
    inferClaimsFromResource: {
      name: "inferClaimsFromResource",
      description: dedent(`
      Explore a resource in order to discover entities and 'claims' (possible facts) it contains, as well resources linked from it.
      
      The URLs for the resource must have been provided in the user messages to you,
      or as the result of a previous action (e.g. a web search, or in suggestions for next steps). Don't guess URLs!
      
      If you want additional information about entities you already know about, or to find new entities to link to existing entities,
      be sure to specify the existing entities under 'relevantEntityIds'.
      
      You can explore multiple resources at once by making multiple calls, but don't start multiple redundant explorations for the same information.
      You can always explore another URL if one doesn't return the information you require.
    `),
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          url: {
            type: "string",
            description: "The URL of the resource",
          },
          goal: {
            type: "string",
            description: dedent(`
              The goal of exploring this specific resource. This will be used to guide what specific entities and claims are discovered.
              
              DO include:
              1. What specifies entities or types of entities you are seeking information on
              2. Any guidance from the user, whether in the original instructions or subsequent questions and answers, which is relevant to the task
              3. If you are seeking specific properties of entities (e.g. "Find me Bob's email"`),
          },
          descriptionOfExpectedContent: {
            type: "string",
            description: dedent(`
              A description of the content you expect to find at the resource.
            `),
          },
          exampleOfExpectedContent: {
            type: "string",
            description: dedent(`
              An example of the content you expect to find at the resource.
            `),
          },
          explanation: {
            type: "string",
            description:
              "An explanation of why inferring claims from the resource is relevant to the research task. This is for audit purposes only",
          },
          relevantEntityIds: {
            type: "array",
            items: {
              type: "string",
            },
            description: dedent(`
                  The entityIds of already proposed entities which you are seeking further detail on, if any.
                  If you expect new entities you are seeking to be linked to already-discovered entities, specify the already-discovered entities here.
                  If you are unsure if an entity is relevant, just include it – it's better to include too many than too few.
                `),
          },
        },
        required: [
          "url",
          "goal",
          "reason",
          "descriptionOfExpectedContent",
          "exampleOfExpectedContent",
        ],
      },
    },
    complete: {
      name: "complete",
      description: dedent(`
        Complete the research task by specifying the entityIds of the entities to highlight as the result of your research.
      `),
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          explanation: {
            type: "string",
            description: dedent(`
              An explanation of why these entities were chosen to highlight as the result of the research task,
              e.g. if the task asked for the 'top X' entities, explain why these are the top X.
            `),
          },
          entityIds: {
            type: "array",
            items: {
              type: "string",
            },
            description: dedent(`
            An array of entityIds to highlight. 
            The user will receive all entities discovered, with the highlighted entityIds identified for special attention.
            You must have made an effort to find as many properties and outgoing links for each entity as possible,
            as long as they relate to the research task in question.
          `),
          },
        },
        required: ["entityIds", "explanation"],
      },
    },
    terminate: {
      name: "terminate",
      description:
        "Terminate the research task, because it cannot be completed with the provided tools.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          explanation: explanationDefinition,
        },
        required: ["explanation"],
      },
    },
    updatePlan: {
      name: "updatePlan",
      description: dedent(`
      Update the plan for the research task.
      You can call this alongside other tool calls to progress towards completing the task.
      
      IMPORTANT: the plan should take account of:
      1. The user's research goal
      2. The information gathered so far.
      
      Don't be afraid to deviate from an earlier plan if you've gathered sufficient information to 
      meet the user's research goal, and return the information to the user.
    `),
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          explanation: {
            type: "string",
            description: dedent(`
            An explanation of why the plan needs to be updated, and
            how the updated plan aligns with the task.
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

  const filteredTools = Object.fromEntries(
    Object.entries(allToolDefinitions).filter(
      ([toolName]) => !omitTools.includes(toolName as T[number]),
    ),
  ) as Record<
    Exclude<CoordinatorToolName, T[number]>,
    LlmToolDefinition<Exclude<CoordinatorToolName, T[number]>>
  >;

  return filteredTools;
};

export type CoordinatorToolCallArguments = Subtype<
  Record<CoordinatorToolName, unknown>,
  {
    requestHumanInput: {
      explanation: string;
      questions: string[];
    };
    webSearch: {
      explanation: string;
      query: string;
    };
    inferClaimsFromResource: {
      explanation: string;
      url: string;
      goal: string;
      relevantEntityIds?: string[];
      descriptionOfExpectedContent: string;
      exampleOfExpectedContent: string;
    };
    delegateResearchTask: {
      goal: string;
      explanation: string;
      relevantEntityIds?: string[];
    };
    updatePlan: {
      explanation: string;
      plan: string;
    };
    complete: {
      entityIds: string[];
      explanation: string;
    };
    terminate: {
      explanation: string;
    };
  }
>;

export type ParsedCoordinatorToolCallMap = {
  [K in keyof CoordinatorToolCallArguments]: ParsedLlmToolCall<
    K,
    CoordinatorToolCallArguments[K]
  >;
};

export type ParsedCoordinatorToolCall =
  ParsedCoordinatorToolCallMap[keyof ParsedCoordinatorToolCallMap];

export type CompletedCoordinatorToolCall<ToolId extends string> = {
  delegatedTasksCompleted?: string[] | null;
  entitySummaries: LocalEntitySummary[] | null;
  inferredClaims: Claim[] | null;
  isError?: boolean;
  output: string;
  resourceUrlsVisited: string[] | null;
  suggestionsForNextStepsMade?: string[] | null;
  updatedPlan: string | null;
  webPagesFromSearchQuery: WebResourceSummary[] | null;
  webQueriesMade: string[] | null;
} & ParsedLlmToolCall<ToolId>;

export type CompletedToolCall<ToolId extends string> = {
  output: string;
  isError?: boolean;
} & ParsedLlmToolCall<ToolId>;

export const nullReturns: Omit<
  CompletedCoordinatorToolCall<string>,
  "output" | "isError" | keyof ParsedLlmToolCall
> = {
  delegatedTasksCompleted: null,
  entitySummaries: null,
  inferredClaims: null,
  resourceUrlsVisited: null,
  suggestionsForNextStepsMade: null,
  updatedPlan: null,
  webPagesFromSearchQuery: null,
  webQueriesMade: null,
};

export const isLongRunningTask: Record<CoordinatorToolName, boolean> = {
  complete: false,
  delegateResearchTask: true,
  inferClaimsFromResource: true,
  requestHumanInput: true,
  terminate: false,
  updatePlan: false,
  webSearch: false,
};

type GetCoordinatorToolCallResultsParams = {
  agentType: "coordinator";
  input: CoordinatingAgentInput;
  state: CoordinatingAgentState;
  toolCalls: Exclude<
    ParsedCoordinatorToolCall,
    | ParsedCoordinatorToolCallMap["complete"]
    | ParsedCoordinatorToolCallMap["terminate"]
  >[];
  workerIdentifiers: WorkerIdentifiers;
};

type GetSubCoordinatorToolCallResultsParams = {
  agentType: "sub-coordinator";
  input: SubCoordinatingAgentInput;
  state: SubCoordinatingAgentState;
  toolCalls: Exclude<
    ParsedSubCoordinatorToolCall,
    | ParsedSubCoordinatorToolCallMap["complete"]
    | ParsedSubCoordinatorToolCallMap["terminate"]
  >[];
  workerIdentifiers: WorkerIdentifiers;
};

export function getToolCallResults(
  params: GetCoordinatorToolCallResultsParams,
): Promise<
  CompletedCoordinatorToolCall<
    Exclude<CoordinatorToolName, "complete" | "terminate">
  >[]
>;

export function getToolCallResults(
  params: GetSubCoordinatorToolCallResultsParams,
): Promise<
  CompletedCoordinatorToolCall<
    Exclude<SubCoordinatingAgentToolName, "complete" | "terminate">
  >[]
>;

export async function getToolCallResults({
  agentType,
  input,
  state,
  toolCalls,
  workerIdentifiers,
}:
  | GetCoordinatorToolCallResultsParams
  | GetSubCoordinatorToolCallResultsParams): Promise<
  CompletedCoordinatorToolCall<
    CoordinatorToolName | SubCoordinatingAgentToolName
  >[]
> {
  const { stepId } = await getFlowContext();

  return await Promise.all(
    toolCalls.map(
      async (
        toolCall,
      ): Promise<CompletedCoordinatorToolCall<CoordinatorToolName>> => {
        if (toolCall.name === "updatePlan") {
          const { plan } = toolCall.input;

          return {
            ...nullReturns,
            ...toolCall,
            updatedPlan: plan,
            output: `The plan has been successfully updated.`,
          };
        } else if (toolCall.name === "requestHumanInput") {
          if (agentType === "sub-coordinator") {
            throw new Error(
              "Sub-coordinator cannot use requestHumanInput tool",
            );
          }

          const { questions } = toolCall.input;

          if (questions.length === 0) {
            return {
              ...toolCall,
              ...nullReturns,
              output: "No questions were provided.",
              isError: true,
            };
          }

          logger.debug(
            `Requesting human input for questions: ${stringify(questions)}`,
          );

          const response = await getAnswersFromHuman(toolCall.input.questions);

          // eslint-disable-next-line no-param-reassign
          state.questionsAndAnswers =
            (state.questionsAndAnswers ?? "") + response;

          return {
            ...nullReturns,
            ...toolCall,
            output: response,
          };
        } else if (toolCall.name === "webSearch") {
          const webPageSummaries = await handleWebSearchToolCall({
            input: toolCall.input,
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
        } else if (toolCall.name === "inferClaimsFromResource") {
          const {
            url,
            goal,
            relevantEntityIds,
            descriptionOfExpectedContent,
            exampleOfExpectedContent,
            explanation,
          } = toolCall.input;

          const relevantEntities = state.entitySummaries.filter(({ localId }) =>
            relevantEntityIds?.includes(localId),
          );

          const linkExplorerIdentifiers: WorkerIdentifiers = {
            workerType: "Link explorer",
            workerInstanceId: generateUuid(),
            parentInstanceId: workerIdentifiers.workerInstanceId,
          };

          logProgress([
            {
              stepId,
              recordedAt: new Date().toISOString(),
              type: "StartedLinkExplorerTask",
              input: {
                goal,
                initialUrl: url,
              },
              explanation,
              ...linkExplorerIdentifiers,
            },
          ]);

          const response = await linkFollowerAgent({
            workerIdentifiers: linkExplorerIdentifiers,
            input: {
              initialResource: {
                goal,
                url,
                descriptionOfExpectedContent,
                exampleOfExpectedContent,
                reason: explanation,
              },
              goal,
              existingEntitiesOfInterest: relevantEntities,
              entityTypes: input.entityTypes,
            },
          });

          logProgress([
            {
              stepId,
              recordedAt: new Date().toISOString(),
              type: "ClosedLinkExplorerTask",
              goal,
              output: {
                claimCount: response.inferredClaims.length,
                entityCount: response.inferredSummaries.length,
                resourcesExploredCount: response.exploredResources.length,
                suggestionForNextSteps: response.suggestionForNextSteps,
              },
              ...linkExplorerIdentifiers,
            },
          ]);

          return {
            ...toolCall,
            ...nullReturns,
            inferredClaims: response.inferredClaims,
            entitySummaries: response.inferredSummaries,
            suggestionsForNextStepsMade: [response.suggestionForNextSteps],
            resourceUrlsVisited: response.exploredResources.map(
              (resource) => resource.url,
            ),
            output:
              response.inferredSummaries.length > 0
                ? "Entities inferred from web page"
                : "No claims were inferred about any relevant entities.",
          };
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- safeguard to ensure all cases are handled
        } else if (toolCall.name === "delegateResearchTask") {
          if (agentType === "sub-coordinator") {
            throw new Error(
              "Sub-coordinator cannot use delegateResearchTask tool",
            );
          }
          const { goal, relevantEntityIds, explanation } = toolCall.input;

          const relevantEntities = state.entitySummaries.filter(({ localId }) =>
            relevantEntityIds?.includes(localId),
          );

          const existingClaimsAboutRelevantEntities =
            state.inferredClaims.filter(({ subjectEntityLocalId }) =>
              relevantEntityIds?.includes(subjectEntityLocalId),
            );

          const delegatedTaskIdentifiers: WorkerIdentifiers = {
            workerType: "Sub-coordinator",
            workerInstanceId: generateUuid(),
            parentInstanceId: workerIdentifiers.workerInstanceId,
          };

          logProgress([
            {
              type: "StartedSubCoordinator",
              explanation,
              input: {
                goal,
                entityTypeTitles: input.entityTypes.map((type) => type.title),
              },
              recordedAt: new Date().toISOString(),
              stepId,
              ...delegatedTaskIdentifiers,
            },
          ]);

          const response = await runSubCoordinatingAgent({
            input: {
              goal,
              relevantEntities,
              existingClaimsAboutRelevantEntities,
              entityTypes: input.entityTypes,
            },
            workerIdentifiers: delegatedTaskIdentifiers,
          });

          logProgress([
            {
              type: "ClosedSubCoordinator",
              errorMessage:
                response.status !== "ok" ? response.explanation : undefined,
              explanation:
                response.status === "ok"
                  ? response.explanation
                  : response.explanation,
              goal,
              output:
                response.status === "ok"
                  ? {
                      claimCount: response.discoveredClaims.length,
                      entityCount: response.discoveredEntities.length,
                    }
                  : { claimCount: 0, entityCount: 0 },
              recordedAt: new Date().toISOString(),
              stepId,
              ...delegatedTaskIdentifiers,
            },
          ]);

          const errorMessage =
            response.status === "ok"
              ? null
              : `An error occurred in the delegated task: ${response.explanation}`;

          return {
            ...toolCall,
            ...nullReturns,
            inferredClaims: response.discoveredClaims,
            entitySummaries: response.discoveredEntities,
            delegatedTasksCompleted: [goal],
            output: errorMessage ?? "Delegated tasks completed.",
            isError: !!errorMessage,
          };
        }

        // @ts-expect-error –– safeguard to ensure all cases are handled
        throw new Error(`Unimplemented tool call: ${toolCall.name}`);
      },
    ),
  );
}
