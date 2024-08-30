import type { Subtype } from "@local/advanced-types/subtype";
import type {
  FlowDataSources,
  WorkerIdentifiers,
} from "@local/hash-isomorphic-utils/flows/types";
import { sleep } from "@local/hash-isomorphic-utils/sleep";
import { stringifyError } from "@local/hash-isomorphic-utils/stringify-error";
import dedent from "dedent";

import { logger } from "../../../shared/activity-logger.js";
import type {
  LlmToolDefinition,
  ParsedLlmToolCall,
} from "../../../shared/get-llm-response/types.js";
import type { LocalEntitySummary } from "../../shared/infer-summaries-then-claims-from-text/get-entity-summaries-from-text.js";
import type { Claim } from "../../shared/infer-summaries-then-claims-from-text/types.js";
import type { SubCoordinatingAgentInput } from "../sub-coordinating-agent/input.js";
import type { SubCoordinatingAgentState } from "../sub-coordinating-agent/state.js";
import type {
  GetCoordinatorToolCallResultsParams,
  GetSubCoordinatorToolCallResultsParams,
} from "./coordinator-tools/get-tool-call-results.js";
import { getToolCallResults } from "./coordinator-tools/get-tool-call-results.js";
import type {
  CoordinatingAgentInput,
  CoordinatingAgentState,
  OutstandingCoordinatorTask,
} from "./coordinators.js";
import { stopWorkers } from "./coordinators.js";
import type { WebResourceSummary } from "./handle-web-search-tool-call.js";

export const coordinatorToolNames = [
  "complete",
  "delegateResearchTask",
  "inferClaimsFromResource",
  "requestHumanInput",
  "stopTasks",
  "terminate",
  "updatePlan",
  "waitForOutstandingTasks",
  "webSearch",
] as const;

export type CoordinatorToolName = (typeof coordinatorToolNames)[number];

/**
 * If one of these tools is granted to the sub-coordinator, the processing logic in {@link getToolCallResults} must be
 * updated.
 */
export const subCoordinatorOmittedCoordinatorToolNames = [
  "complete",
  "delegateResearchTask",
  "requestHumanInput",
] as const;

type SubCoordinatorOmittedCoordinatorToolName =
  (typeof subCoordinatorOmittedCoordinatorToolNames)[number];

const subCoordinatingAgentCustomToolNames = ["complete"] as const;

export type SubCoordinatingAgentCustomToolName =
  (typeof subCoordinatingAgentCustomToolNames)[number];

export type SubCoordinatingAgentToolName =
  | Exclude<CoordinatorToolName, SubCoordinatorOmittedCoordinatorToolName>
  | SubCoordinatingAgentCustomToolName;

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
  state: CoordinatingAgentState | SubCoordinatingAgentState;
}): Record<
  Exclude<CoordinatorToolName, T[number]>,
  LlmToolDefinition<Exclude<CoordinatorToolName, T[number]>>
> => {
  const { internetAccess } = params.dataSources;

  const { outstandingTasks } = params.state;

  const omitTools: CoordinatorToolName[] = params.omitTools ?? [];
  if (!internetAccess.enabled) {
    omitTools.push("webSearch");
  }

  if (outstandingTasks.length === 0) {
    omitTools.push("waitForOutstandingTasks", "stopTasks");
  }

  const allToolDefinitions: Record<
    CoordinatorToolName,
    LlmToolDefinition<CoordinatorToolName>
  > = {
    waitForOutstandingTasks: {
      name: "waitForOutstandingTasks",
      description:
        "Wait for at least some of the outstanding tasks to complete before deciding to pursue any new tasks. You can choose to additionally 'stopTasks' if you think some of the outstanding tasks are no longer useful.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          explanation: {
            type: "string",
            description:
              "An explanation of why waiting for these tasks before taking any other action is the best way to proceed.",
          },
        },
        required: ["explanation"],
      },
    },
    stopTasks: {
      name: "stopTasks",
      description: "Stop one or more outstanding tasks.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          tasksToStop: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                explanation: {
                  type: "string",
                  description:
                    "An explanation of why the task is no longer necessary to further the research task",
                },
                toolCallId: {
                  description: "The toolCallId of the stop you wish to stop",
                  type: "string",
                },
              },
            },
            required: ["explanation", "toolCallId"],
          },
        },
        required: ["tasksToStop"],
      },
    },
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
                    params.state.entitySummaries.length
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
      
      The URLs for the resource must have been provided in messages to you,
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
          "explanation",
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
      1. The research goal
      2. The information gathered so far.
      
      Don't be afraid to deviate from an earlier plan if you've gathered sufficient information to 
      meet the research goal, and return the information discovered.
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
    stopTasks: {
      tasksToStop: {
        explanation: string;
        toolCallId: string;
      }[];
    };
    waitForOutstandingTasks: {
      explanation: string;
    };
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

export type SubCoordinatingAgentToolCallArguments = Omit<
  CoordinatorToolCallArguments,
  SubCoordinatorOmittedCoordinatorToolName
> & {
  complete: {
    explanation: string;
  };
};

export type ParsedSubCoordinatorToolCallMap = {
  [K in keyof SubCoordinatingAgentToolCallArguments]: ParsedLlmToolCall<
    K,
    SubCoordinatingAgentToolCallArguments[K]
  >;
};

export type ParsedSubCoordinatorToolCall =
  ParsedSubCoordinatorToolCallMap[keyof ParsedSubCoordinatorToolCallMap];

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

/**
 * Whether a task is expected to take a non-trivial amount of time to complete.
 *
 * This is used to decide whether to wait for the task to complete before returning to the coordinator.
 *
 * We can wait for all tasks that DON'T potentially take a long time to complete before asking the agent for another
 * decision.
 */
export const isLongRunningTask: Record<CoordinatorToolName, boolean> = {
  complete: false,
  delegateResearchTask: true,
  inferClaimsFromResource: true,
  requestHumanInput: true,
  stopTasks: false,
  terminate: false,
  updatePlan: false,
  waitForOutstandingTasks: false,
  webSearch: false,
};

/**
 * Handle any errors thrown while processing the tool call.
 *
 * This should be rare as any agents called should return 'isError' and 'output' in an object rather than throwing an
 * error.
 *
 * This should only be called as a fallback for when unexpected errors are thrown somewhere.
 */
const toolCallExceptionHandler = <
  ToolCall extends ParsedCoordinatorToolCall | ParsedSubCoordinatorToolCall,
>({
  agentType,
  error,
  toolCall,
}: {
  agentType: "coordinator" | "sub-coordinator";
  error: unknown;
  toolCall: ToolCall;
}): CompletedCoordinatorToolCall<ToolCall["name"]> => {
  logger.error(
    `Error getting ${agentType} tool call results for tool call ${toolCall.name} with id ${toolCall.id}: ${stringifyError(error)}`,
  );

  const errorForLlm =
    error && typeof error === "object" && "message" in error
      ? (error as Error).message
      : stringifyError(error);

  return {
    ...nullReturns,
    ...toolCall,
    isError: true,
    output: `Error using tool: ${errorForLlm}`,
  };
};

type TriggerCoordinatorToolCallsRequestsParams = {
  agentType: "coordinator";
  input: CoordinatingAgentInput;
  state: CoordinatingAgentState;
  toolCalls: GetCoordinatorToolCallResultsParams["toolCall"][];
  workerIdentifiers: WorkerIdentifiers;
};

type TriggerSubCoordinatorToolCallsRequestsParams = {
  agentType: "sub-coordinator";
  input: SubCoordinatingAgentInput;
  state: SubCoordinatingAgentState;
  toolCalls: GetSubCoordinatorToolCallResultsParams["toolCall"][];
  workerIdentifiers: WorkerIdentifiers;
};

export function triggerToolCallsRequests(
  params: TriggerCoordinatorToolCallsRequestsParams,
): OutstandingCoordinatorTask<ParsedCoordinatorToolCall>[];

export function triggerToolCallsRequests(
  params: TriggerSubCoordinatorToolCallsRequestsParams,
): OutstandingCoordinatorTask<ParsedSubCoordinatorToolCall>[];

/**
 * Trigger the requests for the results of tool calls.
 *
 * This intentionally does not await the results promises, allowing the caller to decide which to wait for.
 */
export function triggerToolCallsRequests({
  toolCalls,
  ...restParams
}:
  | TriggerCoordinatorToolCallsRequestsParams
  | TriggerSubCoordinatorToolCallsRequestsParams):
  | OutstandingCoordinatorTask<ParsedCoordinatorToolCall>[]
  | OutstandingCoordinatorTask<ParsedSubCoordinatorToolCall>[] {
  return toolCalls.map((toolCall) => {
    const baseReturn = {
      longRunning: isLongRunningTask[toolCall.name],
      toolCall,
      /**
       * The fact that this is an object is relied on by the finally function below, in order to be able to mutate the
       * value. It can't be 'status: boolean' because baseReturn.status would not refer to the same location in memory
       * – baseReturn is spread below, creating a new object with a new boolean. Whereas 'status: object' points to the
       * same object.
       *
       * If you change this, make sure the fulfilment status of the promise is set some other way.
       */
      status: {
        fulfilled: false,
      },
    };

    /**
     * This repetitive branching is for the TypeScript compiler's benefit, being the least bad way to handle the type
     * narrowing that I could come up with without more time investment in refactoring the functions involved.
     */
    if (restParams.agentType === "coordinator") {
      return {
        ...baseReturn,
        resultsPromise: getToolCallResults({
          ...restParams,
          toolCall,
        })
          .catch((error: unknown) =>
            toolCallExceptionHandler({
              agentType: restParams.agentType,
              error,
              toolCall,
            }),
          )
          .finally(() => {
            baseReturn.status.fulfilled = true;
          }),
      };
    } else {
      return {
        ...baseReturn,
        resultsPromise: getToolCallResults({
          ...restParams,
          toolCall:
            /**
             * Ideally we would not have to do this.
             */
            toolCall as GetSubCoordinatorToolCallResultsParams["toolCall"],
        })
          .catch((error: unknown) =>
            toolCallExceptionHandler({
              agentType: restParams.agentType,
              error,
              toolCall,
            }),
          )
          .finally(() => {
            baseReturn.status.fulfilled = true;
          }),
      };
    }
  });
}

export async function getSomeToolCallResults(params: {
  state: CoordinatingAgentState;
}): Promise<CompletedCoordinatorToolCall<CoordinatorToolName>[]>;

export async function getSomeToolCallResults(params: {
  state: SubCoordinatingAgentState;
}): Promise<CompletedCoordinatorToolCall<SubCoordinatingAgentToolName>[]>;

/**
 * Get tool call results for state.outstandingTasks as follows:
 * 1. All short-lived tasks
 * 2. The first long-lived task to complete, plus any others that complete within 5 seconds
 *
 * Note that if a long-running task was not ready last time this function was called, but became ready in the meantime,
 * this function will return the results of that task plus any others that complete within 5 seconds.
 * An alternative would be to wait for the first _NEW_ long-running task to complete,
 * having first gathered the long-running tasks that are already ready and filter them out of the outstandingTasks.
 *
 * @modifies {state} to remove items from outstanding tasks
 */
export async function getSomeToolCallResults({
  state,
}: {
  state: CoordinatingAgentState | SubCoordinatingAgentState;
}): Promise<
  | CompletedToolCall<CoordinatorToolName>[]
  | CompletedToolCall<SubCoordinatingAgentToolName>[]
> {
  const outstandingShortLivedTasks = state.outstandingTasks.filter(
    ({ longRunning }) => !longRunning,
  );
  const outstandingLongRunningTasks = state.outstandingTasks.filter(
    ({ longRunning }) => longRunning,
  );

  const readyTasks = (
    await Promise.all([
      /**
       * Wait for all the short-lived tasks to complete
       */
      Promise.all(
        outstandingShortLivedTasks.map(({ resultsPromise }) => resultsPromise),
      ),

      /**
       * Wait for the first long-lived task to complete
       *
       * An empty array to Promise.race() will never resolve,
       * so we need to exclude it if the array is empty.
       */
      ...(outstandingLongRunningTasks.length
        ? [
            Promise.race(
              outstandingLongRunningTasks.map(
                ({ resultsPromise }) => resultsPromise,
              ),
            ),
          ]
        : []),
    ])
  ).flat();

  /**
   * A short grace period to allow for any long-running tasks which are ready soon after the first one.
   */
  await sleep(5_000);

  for (const outstandingTask of outstandingLongRunningTasks) {
    if (
      readyTasks.find(
        (readyTask) => readyTask.id === outstandingTask.toolCall.id,
      )
    ) {
      /** we already have this one */
      continue;
    }

    if (outstandingTask.status.fulfilled) {
      readyTasks.push(await outstandingTask.resultsPromise);
    }
  }

  // eslint-disable-next-line no-param-reassign
  state.outstandingTasks = state.outstandingTasks.filter(
    (outstandingTask) =>
      !readyTasks.find(
        (readyTask) => readyTask.id === outstandingTask.toolCall.id,
      ),
    // this is a reasonably safe assertion for the compiler's benefit that we're not changing the array type
  ) as typeof state.outstandingTasks;

  return readyTasks;
}

export const generateOutstandingTasksDescription = (
  state: CoordinatingAgentState | SubCoordinatingAgentState,
) => {
  if (state.outstandingTasks.length === 0) {
    return "";
  }

  return dedent(`
    The following tasks are still outstanding. You may decide to do one of the following:
    1. Call 'waitForOutstandingTasks' to wait for outstanding tasks, OR
    2. Start new tasks.
    
    You may optionally also call 'stopTasks' to stop specific tasks you think are no longer relevant,
    whether or not you're creating new tasks or waiting for outstanding tasks, using their 'toolCallId'.
    
    The outstanding tasks are:
    ${state.outstandingTasks
      .map((task) =>
        dedent(`<OutstandingTask>
      toolCallId: ${task.toolCall.id}
      type: ${task.toolCall.name}
      input: ${JSON.stringify(task.toolCall.input)}
      </OutstandingTask>
    `),
      )
      .join("\n")}
  `);
};

/**
 * Handle requests (tool calls) from the coordinator to early stop tasks that it has started.
 */
export const handleStopTasksRequests = async ({
  state,
  toolCalls,
}: {
  state: CoordinatingAgentState | SubCoordinatingAgentState;
  toolCalls: ParsedCoordinatorToolCall[] | ParsedSubCoordinatorToolCall[];
}) => {
  const stopRequests = toolCalls
    .filter((call) => call.name === "stopTasks")
    .flatMap(({ input }) => input.tasksToStop);

  stopRequests.push(
    ...state.workersStarted.map((workerIdentifiers) => ({
      explanation: "Parent task was stopped",
      toolCallId: workerIdentifiers.toolCallId,
    })),
  );

  await stopWorkers(stopRequests);
};
