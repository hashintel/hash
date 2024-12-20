import dedent from "dedent";
import type { JSONSchemaDefinition } from "openai/lib/jsonschema";

import { getFlowContext } from "../../../shared/get-flow-context.js";
import { getLlmResponse } from "../../../shared/get-llm-response.js";
import { getToolCallsFromLlmAssistantMessage } from "../../../shared/get-llm-response/llm-message.js";
import type { LlmToolDefinition } from "../../../shared/get-llm-response/types.js";
import { graphApiClient } from "../../../shared/graph-api-client.js";
import type {
  CoordinatingAgentInput,
  CoordinatingAgentState,
} from "../shared/coordinators.js";
import { simplifyEntityTypeForLlmConsumption } from "../shared/simplify-for-llm-consumption.js";

type SubmitVerdictToolCallInput = {
  [delegatedTaskId: string]: {
    accept: boolean;
    reason: string;
  };
};

export const checkDelegatedTasksAgent = async (params: {
  input: CoordinatingAgentInput;
  state: CoordinatingAgentState;
  delegatedTasks: {
    goal: string;
    explanation: string;
    delegatedTaskId: string;
  }[];
}): Promise<{
  acceptedDelegatedTasks: {
    delegatedTaskId: string;
    reason: string;
  }[];
  rejectedDelegatedTasks: {
    delegatedTaskId: string;
    reason: string;
  }[];
}> => {
  const { input, state, delegatedTasks } = params;

  const systemPrompt = `
    You are tasked with deciding whether to accept or reject a delegated task of a research task.

    The user will provide you with a list of delegated tasks, where each delegated task includes:
    - "goal": a brief description of what the delegated task is trying to achieve
    - "explanation": a more detailed explanation of why this delegated task was chosen

    The research task that is being worked on is "${input.prompt}".

    Here is the current plan for addressing the research task: ${state.plan}

    The research task can only output information as entities and links, which are defined by the following types:
    ${input.entityTypes
      .map((entityType) => simplifyEntityTypeForLlmConsumption({ entityType }))
      .join("\n")}
    ${
      /**
       * @todo: simplify link type definitions, potentially by moving them to an "Outgoing Links" field
       * on the simplified entity type definition.
       *
       * @see https://linear.app/hash/issue/H-2826/simplify-property-values-for-llm-consumption
       */
      input.linkEntityTypes
        ? `Link Types: ${JSON.stringify(input.linkEntityTypes)}`
        : ""
    }

    Pay careful attention to the properties of the entities and links when
      deciding on whether to accept a delegated task, as a delegated task must only be
      accepted if it will lead to discovering new information that can be
      outputted from the research task as entities and links of the provided
      types.

    You must accept a delegated task if:
    - the delegated task is relevant to the research task, and
    - the delegated task is not a duplicate of another delegated task, and
    - the delegated task will lead to discovering new information that can be outputted from the research task as entities and links.

    You must reject a delegated task if:
    - the delegated task is irrelevant to the research task, or
    - the delegated task is a duplicate of another delegated task, or
    - the delegated task is very similar to the research task itself, or
    - the delegated task will lead to looking up the same information from another delegated task, or
    - the delegated task won't lead to discovering new information that can be outputted from the research task as entities and links.

    Delegated tasks are executed independently, so won't be able to share information between them.

    Therefore you must also reject delegated tasks if they could result in looking up information about more entities
      than is required to complete the research task.

    When the user is looking up information about entities in more than one delegated task, you must reject the delegated tasks if their goals
      don't name and specify which entities to focus on. Otherwise each delegated task may look up information about different entities.
  `;

  const { userAuthentication, flowEntityId, stepId, webId } =
    await getFlowContext();

  const submitVerdictToolDefinition: LlmToolDefinition<"submitVerdict"> = {
    name: "submitVerdict",
    description:
      "Submit the verdict of which delegatedTasks to accept or reject",
    inputSchema: {
      additionalProperties: false,
      type: "object",
      properties: delegatedTasks.reduce(
        (acc, delegatedTask) => ({
          ...acc,
          [delegatedTask.delegatedTaskId]: {
            type: "object",
            additionalProperties: false,
            properties: {
              accept: {
                type: "boolean",
                description: "Whether to accept the delegated task",
              },
              reason: {
                type: "string",
                description:
                  "The reason for accepting or rejecting the delegated task",
              },
            },
            required: ["reason", "accept"],
          },
        }),
        {} as Record<string, JSONSchemaDefinition>,
      ),
      required: [
        ...delegatedTasks.map(({ delegatedTaskId }) => delegatedTaskId),
      ],
    },
  };

  const response = await getLlmResponse(
    {
      model: "gpt-4o-2024-08-06",
      systemPrompt,
      tools: [submitVerdictToolDefinition],
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: dedent(`
                Here are the delegated tasks for the research task: ${JSON.stringify(
                  delegatedTasks,
                )}
            `),
            },
          ],
        },
      ],
      toolChoice: "required",
    },
    {
      customMetadata: {
        stepId,
        taskName: "check-delegated-tasks",
      },
      userAccountId: userAuthentication.actorId,
      graphApiClient,
      incurredInEntities: [{ entityId: flowEntityId }],
      webId,
    },
  );

  if (response.status === "ok") {
    const { message } = response;
    const [toolCall] = getToolCallsFromLlmAssistantMessage({ message });

    if (!toolCall) {
      throw new Error("No tool call found in the LLM response");
    }

    const submitVerdictToolCallInput =
      toolCall.input as SubmitVerdictToolCallInput;

    const acceptedDelegatedTasks: {
      delegatedTaskId: string;
      reason: string;
    }[] = [];
    const rejectedDelegatedTasks: {
      delegatedTaskId: string;
      reason: string;
    }[] = [];

    for (const [delegatedTaskId, { accept, reason }] of Object.entries(
      submitVerdictToolCallInput,
    )) {
      if (accept) {
        acceptedDelegatedTasks.push({ delegatedTaskId, reason });
      } else {
        rejectedDelegatedTasks.push({ delegatedTaskId, reason });
      }
    }

    return { acceptedDelegatedTasks, rejectedDelegatedTasks };
  } else {
    return {
      acceptedDelegatedTasks: delegatedTasks.map(({ delegatedTaskId }) => ({
        delegatedTaskId,
        reason: "Could not get response from sub task checker, accepting task",
      })),
      rejectedDelegatedTasks: [],
    };
  }
};
