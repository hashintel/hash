import dedent from "dedent";

import { logger } from "../../../../shared/logger.js";
import { getFlowContext } from "../../../shared/get-flow-context.js";
import { getLlmResponse } from "../../../shared/get-llm-response.js";
import type { LlmMessage } from "../../../shared/get-llm-response/llm-message.js";
import { getToolCallsFromLlmAssistantMessage } from "../../../shared/get-llm-response/llm-message.js";
import { graphApiClient } from "../../../shared/graph-api-client.js";
import type { ParsedSubCoordinatorToolCall } from "../shared/coordinator-tools.js";
import { coordinatingAgentModel } from "../shared/coordinators.js";
import { mapPreviousCoordinatorCallsToLlmMessages } from "../shared/map-previous-coordinator-calls-to-llm-messages.js";
import {
  generateInitialUserMessage,
  generateProgressReport,
  generateSystemPromptPrefix,
} from "./generate-messages.js";
import type { SubCoordinatingAgentInput } from "./input.js";
import type { SubCoordinatingAgentState } from "./state.js";
import { generateToolDefinitions } from "./sub-coordinator-tools.js";

/**
 * Given the input to and state of the sub-task agent, request the next actions to be taken.
 */
export const requestSubCoordinatorActions = async (params: {
  input: SubCoordinatingAgentInput;
  state: SubCoordinatingAgentState;
}): Promise<{
  toolCalls: ParsedSubCoordinatorToolCall[];
}> => {
  const { input, state } = params;

  const systemPrompt = dedent(`
      ${generateSystemPromptPrefix({ input })}
      
      Make as many tool calls as are required to progress towards completing the task.
    `);

  const llmMessagesFromPreviousToolCalls =
    mapPreviousCoordinatorCallsToLlmMessages({
      includeErrorsOnly: true,
      previousCalls: state.lastCompletedToolCalls,
    });

  const progressReport = generateProgressReport({ input, state });

  const initialUserMessage = generateInitialUserMessage({ input });

  const messages: LlmMessage[] = [initialUserMessage];

  messages.push(...llmMessagesFromPreviousToolCalls);

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
        ...(state.inferredClaims.length > 0 ? [] : ["complete" as const]),
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
        taskName: "sub-coordinator",
      },
      userAccountId: userAuthentication.actorId,
      graphApiClient,
      incurredInEntities: [{ entityId: flowEntityId }],
      webId,
    },
  );

  if (llmResponse.status !== "ok") {
    logger.error("Failed to get tool calls for sub-coordinator-agent");
    return { toolCalls: [] };
  }

  const { message } = llmResponse;

  const toolCalls = getToolCallsFromLlmAssistantMessage({
    message,
    /**
     * @todo fix this – possibly something to do with how the Omit/Excludes are used in the sub-coordinator types
     */
  }) as ParsedSubCoordinatorToolCall[];

  return { toolCalls };
};
