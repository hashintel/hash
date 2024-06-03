import type { OmitValue } from "@local/advanced-types/omit-value";
import type { Subtype } from "@local/advanced-types/subtype";
import dedent from "dedent";

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
import { generatePreviouslyInferredFactsSystemPromptMessage } from "./generate-previously-inferred-facts-system-prompt-message";
import { handleWebSearchToolCall } from "./handle-web-search-tool-call";
import type { CompletedToolCall } from "./types";
import { mapPreviousCallsToLlmMessages } from "./util";

const model: LlmParams["model"] = "claude-3-opus-20240229";

const omittedCoordinatorToolNames = [
  "complete",
  "startFactGatheringSubTasks",
  "proposeEntitiesFromFacts",
  "requestHumanInput",
  "submitProposedEntities",
  "terminate",
] as const;

type OmittedCoordinatorToolNames = Subtype<
  CoordinatorToolName,
  (typeof omittedCoordinatorToolNames)[number]
>;

const subTaskAgentCustomToolNames = ["complete", "terminate"] as const;

type SubTaskAgentCustomToolName = (typeof subTaskAgentCustomToolNames)[number];

type SubTaskAgentToolName =
  | OmitValue<CoordinatorToolName, OmittedCoordinatorToolNames>
  | SubTaskAgentCustomToolName;

const generateToolDefinitions = <
  T extends SubTaskAgentCustomToolName[],
>(params: {
  omitTools: T;
}): Record<
  OmitValue<SubTaskAgentToolName, T[number]>,
  LlmToolDefinition<OmitValue<SubTaskAgentToolName, T[number]>>
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
    OmitValue<SubTaskAgentToolName, T[number]>,
    LlmToolDefinition<OmitValue<SubTaskAgentToolName, T[number]>>
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
  const { relevantEntities, existingFactsAboutRelevantEntities } = params.input;

  return dedent(`
    You are a sub-task agent for a research task.

    The user will provide you with:
      - Goal: the research goal you need to satisfy to complete the research task
      ${relevantEntities.length > 0 ? `- Relevant Entities: a list entities which have already been discovered and may be relevant to the research goal` : ""}
      ${existingFactsAboutRelevantEntities.length > 0 ? `- Existing Facts About Relevant Entities: a list of facts that have already been discovered about the relevant entities` : ""}

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
};

export type SubTaskAgentState = {
  plan: string;
  inferredFactsAboutEntities: LocalEntitySummary[];
  inferredFacts: Fact[];
  previousCalls: {
    completedToolCalls: CompletedToolCall<SubTaskAgentToolName>[];
  }[];
};

const generateInitialUserMessage = (params: {
  input: SubTaskAgentInput;
}): LlmUserMessage => {
  const { goal, relevantEntities, existingFactsAboutRelevantEntities } =
    params.input;

  return {
    role: "user",
    content: [
      {
        type: "text",
        text: dedent(`
Goal: ${goal}
${relevantEntities.length > 0 ? `Relevant Entities: ${JSON.stringify(relevantEntities)}` : ""}
${existingFactsAboutRelevantEntities.length > 0 ? `Existing Facts About Relevant Entities: ${JSON.stringify(existingFactsAboutRelevantEntities)}` : ""}
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

  const { userAuthentication, flowEntityId, webId } = await getFlowContext();

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

  const { userAuthentication, flowEntityId, webId } = await getFlowContext();

  const llmResponse = await getLlmResponse(
    {
      systemPrompt,
      messages,
      model,
      tools,
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

export const runSubTaskAgent = async (params: {
  goal: string;
  relevantEntities: LocalEntitySummary[];
  existingFactsAboutRelevantEntities: Fact[];
  testingParams?: {
    persistState: (state: SubTaskAgentState) => void;
    resumeFromState?: SubTaskAgentState;
  };
}): Promise<
  | {
      status: "ok";
      explanation: string;
      discoveredEntities: LocalEntitySummary[];
      discoveredFacts: Fact[];
    }
  | {
      status: "terminated";
      reason: string;
      discoveredEntities: LocalEntitySummary[];
      discoveredFacts: Fact[];
    }
> => {
  const { testingParams, ...input } = params;

  let state: SubTaskAgentState;

  if (testingParams?.resumeFromState) {
    state = testingParams.resumeFromState;
  } else {
    const { initialPlan } = await createInitialPlan({ input });

    state = {
      plan: initialPlan,
      inferredFacts: [],
      inferredFactsAboutEntities: [],
      previousCalls: [],
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
      toolCalls.map(
        async (toolCall): Promise<CompletedToolCall<SubTaskAgentToolName>> => {
          if (toolCall.name === "updatePlan") {
            const { plan } =
              toolCall.input as SubTaskAgentToolCallArguments["updatePlan"];

            state.plan = plan;

            return {
              ...toolCall,
              output: `The plan has been successfully updated.`,
            };
          } else if (toolCall.name === "webSearch") {
            const { output } = await handleWebSearchToolCall({
              input:
                toolCall.input as SubTaskAgentToolCallArguments["webSearch"],
            });

            return {
              ...toolCall,
              output,
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
    discoveredEntities: state.inferredFactsAboutEntities,
    discoveredFacts: state.inferredFacts,
  };
};
