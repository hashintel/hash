import dedent from "dedent";

import { getFlowContext } from "../../../shared/get-flow-context.js";
import { getLlmResponse } from "../../../shared/get-llm-response.js";
import type { LlmMessage } from "../../../shared/get-llm-response/llm-message.js";
import { getToolCallsFromLlmAssistantMessage } from "../../../shared/get-llm-response/llm-message.js";
import { graphApiClient } from "../../../shared/graph-api-client.js";
import type { ParsedCoordinatorToolCall } from "../shared/coordinator-tools.js";
import { generateToolDefinitions } from "../shared/coordinator-tools.js";
import type {
  CoordinatingAgentInput,
  CoordinatingAgentState,
} from "../shared/coordinators.js";
import { coordinatingAgentModel } from "../shared/coordinators.js";
import { mapPreviousCoordinatorCallsToLlmMessages } from "../shared/map-previous-coordinator-calls-to-llm-messages.js";
import {
  generateInitialUserMessage,
  generateProgressReport,
  generateSystemPromptPrefix,
} from "./generate-messages.js";

/**
 * Given the current state of the coordinating agent, request the next actions to be taken.
 */
export const requestCoordinatorActions = async (params: {
  input: CoordinatingAgentInput;
  state: CoordinatingAgentState;
}): Promise<{
  toolCalls: ParsedCoordinatorToolCall[];
}> => {
  const { input, state } = params;

  const systemPrompt = dedent(`
      ${generateSystemPromptPrefix({
        input,
      })}

      Make as many tool calls as are required to progress towards completing the task.
    `);

  const llmMessagesFromPreviousToolCalls =
    mapPreviousCoordinatorCallsToLlmMessages({
      includeErrorsOnly: true,
      previousCalls: state.previousCalls,
    });

  const initialUserMessage = generateInitialUserMessage({
    input,
    questionsAndAnswers: state.questionsAndAnswers,
  });

  const messages: LlmMessage[] = [
    { role: "user", content: [initialUserMessage] },
  ];

  messages.push(...llmMessagesFromPreviousToolCalls);

  const progressReport = generateProgressReport({ input, state });

  messages.push({
    role: "user",
    content: [progressReport],
  });

  const { dataSources, userAuthentication, flowEntityId, stepId, webId } =
    await getFlowContext();

  const tools = Object.values(
    generateToolDefinitions({
      dataSources,
      omitTools: [
        ...(input.humanInputCanBeRequested
          ? []
          : ["requestHumanInput" as const]),
        ...(state.proposedEntities.length > 0 ? [] : ["complete" as const]),
      ],
      state,
    }),
  );

  const llmResponse = await getLlmResponse(
    {
      systemPrompt,
      messages,
      model: coordinatingAgentModel,
      tools,
      toolChoice: "required",
    },
    {
      customMetadata: {
        stepId,
        taskName: "coordinator",
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

  const toolCalls = getToolCallsFromLlmAssistantMessage({
    message,
  }) as ParsedCoordinatorToolCall[];

  return { toolCalls };
};
