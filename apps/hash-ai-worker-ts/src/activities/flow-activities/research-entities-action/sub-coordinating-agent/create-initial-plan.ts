import dedent from "dedent";

import { getFlowContext } from "../../../shared/get-flow-context.js";
import { getLlmResponse } from "../../../shared/get-llm-response.js";
import { getToolCallsFromLlmAssistantMessage } from "../../../shared/get-llm-response/llm-message.js";
import { graphApiClient } from "../../../shared/graph-api-client.js";
import { coordinatingAgentModel } from "../shared/coordinators.js";
import {
  generateInitialUserMessage,
  generateSystemPromptPrefix,
} from "./generate-messages.js";
import type { SubCoordinatingAgentInput } from "./input.js";
import type { SubCoordinatingAgentState } from "./state.js";
import { generateToolDefinitions } from "./sub-coordinator-tools.js";
import {
  SubCoordinatingAgentToolCallArguments,
  SubCoordinatingAgentToolName,
} from "../shared/coordinator-tools.js";

export const createInitialPlan = async (params: {
  input: SubCoordinatingAgentInput;
  state: SubCoordinatingAgentState;
}): Promise<{ initialPlan: string }> => {
  const { input, state } = params;
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
      state,
    }),
  );

  const llmResponse = await getLlmResponse(
    {
      systemPrompt,
      messages: [generateInitialUserMessage({ input })],
      model: coordinatingAgentModel,
      tools,
      toolChoice: "updatePlan" satisfies SubCoordinatingAgentToolName,
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
      updatePlanToolCall.input as SubCoordinatingAgentToolCallArguments["updatePlan"];

    return { initialPlan: plan };
  }

  throw new Error(
    `Could not find "updatePlan" tool call in LLM response: ${JSON.stringify(
      llmResponse,
    )}`,
  );
};
