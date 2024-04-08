import { StatusCode } from "@local/status";
import dedent from "dedent";
import type {
  ChatCompletionCreateParams,
  ChatCompletionMessageParam,
  ChatCompletionSystemMessageParam,
} from "openai/resources";

import { modelAliasToSpecificModel } from "../../infer-entities";
import { getOpenAiResponse } from "../../infer-entities/shared/get-open-ai-response";
import type { CoordinatorToolId } from "./coordinator-tools";
import {
  coordinatorToolDefinitions,
  isCoordinatorToolId,
} from "./coordinator-tools";
import type {
  CompletedToolCall,
  ProposedEntityWithLocalId,
  ToolCall,
} from "./types";
import {
  mapPreviousCallsToChatCompletionMessages,
  mapToolDefinitionToOpenAiTool,
  parseOpenAiFunctionArguments,
} from "./util";

const getNextToolCalls = async (params: {
  submittedProposedEntities: ProposedEntityWithLocalId[];
  previousPlan: string;
  previousCalls?: {
    completedToolCalls: CompletedToolCall<CoordinatorToolId>[];
  }[];
  prompt: string;
}): Promise<{
  toolCalls: ToolCall<CoordinatorToolId>[];
}> => {
  const { prompt, previousCalls, submittedProposedEntities, previousPlan } =
    params;

  const systemMessage: ChatCompletionSystemMessageParam = {
    role: "system",
    content: dedent(`
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
    `),
  };

  const messages: ChatCompletionMessageParam[] = [
    systemMessage,
    {
      role: "user",
      content: prompt,
    },
    ...(previousCalls
      ? mapPreviousCallsToChatCompletionMessages({ previousCalls })
      : []),
  ];

  const openApiPayload: ChatCompletionCreateParams = {
    messages,
    model: modelAliasToSpecificModel["gpt-4-turbo"],
    tools: Object.values(coordinatorToolDefinitions).map(
      mapToolDefinitionToOpenAiTool,
    ),
  };

  const openAiResponse = await getOpenAiResponse(openApiPayload);

  if (openAiResponse.code !== StatusCode.Ok) {
    throw new Error(
      `Failed to get OpenAI response: ${JSON.stringify(openAiResponse)}`,
    );
  }

  const { response, usage: _usage } = openAiResponse.contents[0]!;

  /** @todo: capture usage */

  const openAiToolCalls = response.message.tool_calls;

  if (!openAiToolCalls) {
    /** @todo: retry this instead */
    throw new Error(
      `Expected tool calls in response: ${JSON.stringify(response)}`,
    );
  }

  const coordinatorToolCalls = openAiToolCalls.map<ToolCall<CoordinatorToolId>>(
    (openAiToolCall) => {
      if (isCoordinatorToolId(openAiToolCall.function.name)) {
        return {
          toolId: openAiToolCall.function.name,
          openAiToolCall,
          parsedArguments: parseOpenAiFunctionArguments({
            stringifiedArguments: openAiToolCall.function.arguments,
          }),
        };
      }

      throw new Error(`Unexpected tool call: ${openAiToolCall.function.name}`);
    },
  );

  return {
    toolCalls: coordinatorToolCalls,
  };
};

const createInitialPlan = async (params: {
  prompt: string;
}): Promise<{ plan: string }> => {
  const { prompt } = params;

  const messages: ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: dedent(`
        You are a coordinating agent for a research task.
        The user will provides you with a text prompt, from which you will be
          able to make the relevant function calls to progress towards 
          completing the task.
        You must completely satisfy the research prompt, without any missing information.

        Do not make *any* tool calls. You must first provide a plan of how you will use
          the tools to progress towards completing the task.
        This should be a list of steps in plain English.
      `),
    },
    {
      role: "user",
      content: prompt,
    },
  ];

  const openApiPayload: ChatCompletionCreateParams = {
    messages,
    model: modelAliasToSpecificModel["gpt-4-turbo"],
    tools: Object.values(coordinatorToolDefinitions)
      .filter(({ toolId }) => toolId !== "updatePlan")
      .map(mapToolDefinitionToOpenAiTool),
  };

  const openAiResponse = await getOpenAiResponse(openApiPayload);

  if (openAiResponse.code !== StatusCode.Ok) {
    throw new Error(
      `Failed to get OpenAI response: ${JSON.stringify(openAiResponse)}`,
    );
  }

  const { response, usage: _usage } = openAiResponse.contents[0]!;

  /** @todo: capture usage */

  const openAiAssistantMessageContent = response.message.content;

  if (!openAiAssistantMessageContent) {
    throw new Error(
      `Expected message content in response: ${JSON.stringify(response, null, 2)}`,
    );
  }

  return {
    plan: openAiAssistantMessageContent,
  };
};

export const coordinatingAgent = {
  createInitialPlan,
  getNextToolCalls,
};
