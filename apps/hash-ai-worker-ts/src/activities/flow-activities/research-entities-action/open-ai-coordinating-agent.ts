import type { ProposedEntity } from "@local/hash-isomorphic-utils/flows/types";
import dedent from "dedent";

import { getLlmResponse } from "../../shared/get-llm-response";
import {
  getTextContentFromLlmMessage,
  getToolCallsFromLlmAssistantMessage,
  mapOpenAiMessagesToLlmMessages,
} from "../../shared/get-llm-response/llm-message";
import type { ParsedLlmToolCall } from "../../shared/get-llm-response/types";
import type { PermittedOpenAiModel } from "../../shared/openai-client";
import type { CoordinatorToolName } from "./coordinator-tools";
import { coordinatorToolDefinitions } from "./coordinator-tools";
import type { CompletedToolCall } from "./types";
import { mapPreviousCallsToChatCompletionMessages } from "./util";

const model: PermittedOpenAiModel = "gpt-4-0125-preview";

const getNextToolCalls = async (params: {
  submittedProposedEntities: ProposedEntity[];
  previousPlan: string;
  previousCalls?: {
    completedToolCalls: CompletedToolCall<CoordinatorToolName>[];
  }[];
  prompt: string;
}): Promise<{
  toolCalls: ParsedLlmToolCall<CoordinatorToolName>[];
}> => {
  const { prompt, previousCalls, submittedProposedEntities, previousPlan } =
    params;

  const systemMessageContent = dedent(`
      You are a coordinating agent for a research task.
      The user will provides you with a text prompt, from which you will be
        able to make the relevant function calls to progress towards 
        completing the task.
      Make as many tool calls as are required to progress towards completing the task.
      You must completely satisfy the research prompt, without any missing information.

      ${
        submittedProposedEntities.length > 0
          ? dedent(`
            You have previously submitted the following proposed entities:
            ${JSON.stringify(submittedProposedEntities, null, 2)}

            If the submitted entities satisfy the research prompt, call the "complete" tool.
          `)
          : "You have not previously submitted any proposed entities."
      }

      You have previously proposed the following plan:
      ${previousPlan}
      If you want to deviate from this plan, update it using the "updatePlan" tool.
      You must call the "updatePlan" tool alongside other tool calls to progress towards completing the task.
    `);

  const messages = mapOpenAiMessagesToLlmMessages({
    messages: [
      {
        role: "user",
        content: prompt,
      },
      ...(previousCalls
        ? mapPreviousCallsToChatCompletionMessages({ previousCalls })
        : []),
    ],
  });

  const tools = Object.values(coordinatorToolDefinitions);

  const llmResponse = await getLlmResponse({
    systemMessageContent,
    messages,
    model,
    tools,
  });

  if (llmResponse.status !== "ok") {
    throw new Error(
      `Failed to get LLM response: ${JSON.stringify(llmResponse)}`,
    );
  }

  const { message, usage: _usage } = llmResponse;

  const toolCalls = getToolCallsFromLlmAssistantMessage({ message });

  /** @todo: capture usage */

  return { toolCalls };
};
const createInitialPlan = async (params: {
  prompt: string;
}): Promise<{ plan: string }> => {
  const { prompt } = params;

  const systemMessageContent = dedent(`
    You are a coordinating agent for a research task.
    The user will provides you with a text prompt, from which you will be
      able to make the relevant function calls to progress towards 
      completing the task.
    You must completely satisfy the research prompt, without any missing information.

    Do not make *any* tool calls. You must first provide a plan of how you will use
      the tools to progress towards completing the task.
    This should be a list of steps in plain English.
  `);

  const llmResponse = await getLlmResponse({
    systemMessageContent,
    messages: [
      {
        role: "user",
        content: [{ type: "text", text: prompt }],
      },
    ],
    model,
    tools: Object.values(coordinatorToolDefinitions).filter(
      ({ name }) => name !== "updatePlan",
    ),
  });

  if (llmResponse.status !== "ok") {
    throw new Error(
      `Failed to get OpenAI response: ${JSON.stringify(llmResponse)}`,
    );
  }

  const { usage: _usage, message } = llmResponse;

  const messageTextContent = getTextContentFromLlmMessage({ message });

  /** @todo: capture usage */

  if (!messageTextContent) {
    throw new Error(
      `Expected message content in message: ${JSON.stringify(message, null, 2)}`,
    );
  }

  return { plan: messageTextContent };
};

export const coordinatingAgent = {
  createInitialPlan,
  getNextToolCalls,
};
