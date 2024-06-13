import dedent from "dedent";
import type { JSONSchemaDefinition } from "openai/lib/jsonschema";

import { getFlowContext } from "../../shared/get-flow-context";
import { getLlmResponse } from "../../shared/get-llm-response";
import { getToolCallsFromLlmAssistantMessage } from "../../shared/get-llm-response/llm-message";
import type { LlmToolDefinition } from "../../shared/get-llm-response/types";
import { graphApiClient } from "../../shared/graph-api-client";
import type {
  CoordinatingAgentInput,
  CoordinatingAgentState,
} from "./coordinating-agent";
import { simplifyEntityTypeForLlmConsumption } from "./shared/simplify-ontology-types-for-llm-consumption";

type SubmitVerdictToolCallInput = {
  [subTaskId: string]: {
    accept: boolean;
    reason: string;
  };
};

export const checkSubTasksAgent = async (params: {
  input: CoordinatingAgentInput;
  state: CoordinatingAgentState;
  subTasks: {
    goal: string;
    explanation: string;
    subTaskId: string;
  }[];
}): Promise<{
  acceptedSubTasks: {
    subTaskId: string;
    reason: string;
  }[];
  rejectedSubTasks: {
    subTaskId: string;
    reason: string;
  }[];
}> => {
  const { input, state, subTasks } = params;

  const systemPrompt = `
    You are tasked with deciding whether to accept or reject a subtask of a research task.

    The user will provide you with a list of subtasks, where each subtask includes:
    - "goal": a brief description of what the subtask is trying to achieve
    - "explanation": a more detailed explanation of why this subtask was chosen

    The research task that is being worked on is "${input.prompt}".

    Here is the current plan for addressing the research task: ${state.plan}

    The research task can only output information as entities and links, which are defined by the following types:
    ${input.entityTypes.map((entityType) => simplifyEntityTypeForLlmConsumption({ entityType })).join("\n")}
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
      deciding on whether to accept a subtask, as a subtask must only be
      accepted if it will lead to discovering new information that can be
      outputted from the research task as entities and links of the provided
      types.

    You must accept a subtask if:
    - the subtask is relevant to the research task, and
    - the subtask is not a duplicate of another subtask, and
    - the subtask will lead to discovering new information that can be outputted from the research task as entities and links.

    You must reject a subtask if:
    - the subtask is irrelevant to the research task, or
    - the subtask is a duplicate of another subtask, or
    - the subtask will lead to looking up the same information from another subtask, or
    - the subtask won't lead to discovering new information that can be outputted from the research task as entities and links.

    Subtasks are executed independently, so won't be able to share information between them.

    Therefore you must also reject subtasks if they could result in looking up information about more entities
      than is required to complete the research task.

    When the user is looking up information about entities in more than one subtask, you must reject the subtasks if their goals
      don't name and specify which entities to focus on. Otherwise each subtask may look up information about different entities.
  `;

  const { userAuthentication, flowEntityId, webId } = await getFlowContext();

  const submitVerdictToolDefinition: LlmToolDefinition<"submitVerdict"> = {
    name: "submitVerdict",
    description: "Submit the verdict of which subTasks to accept or reject",
    inputSchema: {
      type: "object",
      properties: subTasks.reduce(
        (acc, subTask) => ({
          ...acc,
          [subTask.subTaskId]: {
            type: "object",
            properties: {
              accept: {
                type: "boolean",
                description: "Whether to accept the subTask",
              },
              reason: {
                type: "string",
                description:
                  "The reason for accepting or rejecting the subTask",
              },
            },
            required: ["reason", "accept"],
          },
        }),
        {} as Record<string, JSONSchemaDefinition>,
      ),
      required: [...subTasks.map(({ subTaskId }) => subTaskId)],
    },
  };

  const response = await getLlmResponse(
    {
      model: "claude-3-opus-20240229",
      systemPrompt,
      tools: [submitVerdictToolDefinition],
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: dedent(`
                Here are the subtasks for the research task: ${JSON.stringify(subTasks)}
            `),
            },
          ],
        },
      ],
      toolChoice: "required",
    },
    {
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

    const acceptedSubTasks: { subTaskId: string; reason: string }[] = [];
    const rejectedSubTasks: { subTaskId: string; reason: string }[] = [];

    for (const [subTaskId, { accept, reason }] of Object.entries(
      submitVerdictToolCallInput,
    )) {
      if (accept) {
        acceptedSubTasks.push({ subTaskId, reason });
      } else {
        rejectedSubTasks.push({ subTaskId, reason });
      }
    }

    return { acceptedSubTasks, rejectedSubTasks };
  } else {
    throw new Error("Failed to get LLM response");
  }
};
