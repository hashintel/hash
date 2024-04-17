import Ajv from "ajv";
import dedent from "dedent";
import type OpenAI from "openai";
import type {
  ChatCompletion,
  ChatCompletion as OpenAiChatCompletion,
  ChatCompletionCreateParamsNonStreaming,
  FunctionParameters as OpenAiFunctionParameters,
} from "openai/resources";
import { promptTokensEstimate } from "openai-chat-tokens";

import { logger } from "../../shared/logger";
import type {
  AnthropicMessagesCreateParams,
  AnthropicToolDefinition,
  MessageContent,
} from "./get-llm-response/anthropic-client";
import {
  anthropicMessageModelToMaxOutput,
  createAnthropicMessagesWithTools,
  isAnthropicContentToolUseContent,
} from "./get-llm-response/anthropic-client";
import type {
  AnthropicLlmParams,
  AnthropicResponse,
  LlmParams,
  LlmResponse,
  LlmStopReason,
  LlmToolDefinition,
  OpenAiLlmParams,
  ParsedLlmToolCall,
} from "./get-llm-response/types";
import { isLlmParamsAnthropicLlmParams } from "./get-llm-response/types";
import { modelToContextWindow, openai } from "./openai-client";
import { stringify } from "./stringify";

const mapLlmToolDefinitionToAnthropicToolDefinition = (
  tool: LlmToolDefinition,
): AnthropicToolDefinition => ({
  name: tool.name,
  description: tool.description,
  input_schema: tool.inputSchema,
});

const mapLlmToolDefinitionToOpenAiToolDefinition = (
  tool: LlmToolDefinition,
): OpenAI.Chat.Completions.ChatCompletionTool => ({
  type: "function",
  function: {
    name: tool.name,
    parameters: tool.inputSchema as OpenAiFunctionParameters,
    description: tool.description,
  },
});

const parseToolCallsFromAnthropicResponse = (
  response: AnthropicResponse,
): ParsedLlmToolCall[] =>
  response.content
    .filter(isAnthropicContentToolUseContent)
    .map(({ id, name, input }) => ({ id, name, input }));

const mapOpenAiFinishReasonToLlmStopReason = (
  finishReason: OpenAiChatCompletion["choices"][0]["finish_reason"],
): LlmStopReason => {
  switch (finishReason) {
    case "stop":
      return "stop";
    case "tool_calls":
      return "tool_use";
    case "length":
      return "length";
    case "content_filter":
      return "content_filter";
    default:
      throw new Error(`Unexpected OpenAI finish reason: ${finishReason}`);
  }
};

const mapAnthropicStopReasonToLlmStopReason = (
  stopReason: AnthropicResponse["stop_reason"],
): LlmStopReason => {
  switch (stopReason) {
    case "end_turn":
      return "stop";
    case "tool_use":
      return "tool_use";
    case "max_tokens":
      return "length";
    case "stop_sequence":
      return "stop_sequence";
    default:
      throw new Error(`Unexpected Anthropic stop reason: ${stopReason}`);
  }
};

const ajv = new Ajv();

const maxRetryCount = 3;

const getAnthropicResponse = async (
  params: AnthropicLlmParams,
): Promise<LlmResponse<AnthropicLlmParams>> => {
  const { tools, retryCount = 0 } = params;

  const anthropicTools = tools?.map(
    mapLlmToolDefinitionToAnthropicToolDefinition,
  );

  /**
   * Default to the maximum context window, if `max_tokens` is not provided.
   */
  const maxTokens =
    params.maxTokens ?? anthropicMessageModelToMaxOutput[params.model];

  let anthropicResponse: AnthropicResponse;

  try {
    anthropicResponse = await createAnthropicMessagesWithTools({
      ...params,
      max_tokens: maxTokens,
      tools: anthropicTools,
    });

    logger.debug(`Anthropic API response: ${stringify(anthropicResponse)}`);
  } catch (error) {
    logger.error(`Anthropic API error: ${stringify(error)}`);

    return {
      status: "api-error",
    };
  }

  const retry = async (retryParams: {
    retryMessage: AnthropicMessagesCreateParams["messages"][number];
  }): Promise<LlmResponse<AnthropicLlmParams>> => {
    if (retryCount > maxRetryCount) {
      return {
        status: "exceeded-maximum-retries",
      };
    }

    return getAnthropicResponse({
      ...params,
      retryCount: retryCount + 1,
      messages: [
        ...params.messages,
        {
          role: "assistant",
          content: anthropicResponse.content,
        },
        retryParams.retryMessage,
      ],
    });
  };

  const parsedToolCalls =
    parseToolCallsFromAnthropicResponse(anthropicResponse);

  const stopReason = mapAnthropicStopReasonToLlmStopReason(
    anthropicResponse.stop_reason,
  );

  if (stopReason === "tool_use" && parsedToolCalls.length > 0) {
    const retryMessageContent: MessageContent = [];

    for (const toolCall of parsedToolCalls) {
      const toolDefinition = tools?.find((tool) => tool.name === toolCall.name);

      if (!toolDefinition) {
        retryMessageContent.push({
          type: "tool_result",
          tool_use_id: toolCall.id,
          content: "Tool not found",
          is_error: true,
        });

        continue;
      }

      const validate = ajv.compile({
        ...toolDefinition.inputSchema,
        additionalProperties: false,
      });

      const inputIsValid = validate(toolCall.input);

      if (!inputIsValid) {
        retryMessageContent.push({
          type: "tool_result",
          tool_use_id: toolCall.id,
          content: dedent(`
            The provided input did not match the schema.
            It contains the following errors: ${stringify(validate.errors)}
          `),
          is_error: true,
        });
      }
    }

    if (retryMessageContent.length > 0) {
      return retry({
        retryMessage: {
          role: "user",
          content: retryMessageContent,
        },
      });
    }
  }

  const response: LlmResponse<AnthropicLlmParams> = {
    status: "ok",
    parsedToolCalls,
    stopReason,
    ...anthropicResponse,
  };

  return response;
};

const getOpenAiResponse = async (
  params: OpenAiLlmParams,
): Promise<LlmResponse<OpenAiLlmParams>> => {
  const { tools, trimMessageAtIndex, retryCount = 0 } = params;

  const openAiTools = tools?.map(mapLlmToolDefinitionToOpenAiToolDefinition);

  const completionPayload: ChatCompletionCreateParamsNonStreaming = {
    ...params,
    tools: openAiTools,
    stream: false,
  };

  /**
   * @todo: consider removing the message trimming functionality,
   * in favor of forcing the caller to chunk calls to the API
   * according to the model's context window size.
   */
  let estimatedPromptTokens: number | undefined;
  if (typeof trimMessageAtIndex === "number") {
    const modelContextWindow = modelToContextWindow[params.model];

    const completionPayloadOverhead = 4_096;

    let excessTokens: number;
    do {
      estimatedPromptTokens = promptTokensEstimate({
        messages: params.messages,
        functions: openAiTools?.map((tool) => tool.function),
      });

      logger.info(`Estimated prompt tokens: ${estimatedPromptTokens}`);

      excessTokens =
        estimatedPromptTokens + completionPayloadOverhead - modelContextWindow;

      if (excessTokens < 10) {
        break;
      }

      logger.info(
        `Estimated prompt tokens (${estimatedPromptTokens}) + completion token overhead (${completionPayloadOverhead}) exceeds model context window (${modelContextWindow}), trimming original user text input by ${
          excessTokens / 4
        } characters.`,
      );

      const firstUserMessageContent =
        completionPayload.messages[trimMessageAtIndex]!.content;

      completionPayload.messages[trimMessageAtIndex]!.content =
        firstUserMessageContent?.slice(
          0,
          firstUserMessageContent.length - excessTokens * 4,
        ) ?? "";
    } while (excessTokens > 9);
  }

  let openAiResponse: ChatCompletion;

  try {
    openAiResponse = await openai.chat.completions.create(completionPayload);

    logger.debug(`OpenAI response: ${stringify(openAiResponse)}`);
  } catch (error) {
    logger.error(`OpenAI API error: ${stringify(error)}`);

    return {
      status: "api-error",
    };
  }

  const retry = async (retryParams: {
    retryMessages: OpenAiLlmParams["messages"];
  }): Promise<LlmResponse<OpenAiLlmParams>> => {
    if (retryCount > maxRetryCount) {
      return {
        status: "exceeded-maximum-retries",
      };
    }

    logger.debug(
      `Retrying OpenAI call with the following retry messages: ${stringify(retryParams.retryMessages)}`,
    );

    return getOpenAiResponse({
      ...params,
      retryCount: retryCount + 1,
      messages: [
        ...params.messages,
        openAiResponse.choices[0]?.message ?? [],
        ...retryParams.retryMessages,
      ].flat(),
    });
  };

  /**
   * @todo: consider accounting for `choices` in the unified LLM response
   */
  const firstChoice = openAiResponse.choices[0];

  if (!firstChoice) {
    return retry({
      retryMessages: [
        {
          role: "user",
          content: "No response was provided by the model",
        },
      ],
    });
  }

  const parsedToolCalls: ParsedLlmToolCall[] = [];

  const retryMessages: OpenAiLlmParams["messages"] = [];

  for (const openAiToolCall of firstChoice.message.tool_calls ?? []) {
    const {
      id,
      function: { name, arguments: functionArguments },
    } = openAiToolCall;

    const toolDefinition = tools?.find((tool) => tool.name === name);

    if (!toolDefinition) {
      retryMessages.push({
        role: "tool",
        tool_call_id: id,
        content: "Tool not found",
      });

      continue;
    }

    let parsedInput: object | undefined = undefined;

    try {
      parsedInput = JSON.parse(functionArguments) as object;
    } catch (error) {
      retryMessages.push({
        role: "tool",
        tool_call_id: id,
        content: `Your JSON arguments could not be parsed – the parsing function errored: ${
          (error as Error).message
        }. Please try again.`,
      });

      continue;
    }

    const validate = ajv.compile({
      ...toolDefinition.inputSchema,
      additionalProperties: false,
    });

    const inputIsValid = validate(parsedInput);

    if (!inputIsValid) {
      retryMessages.push({
        role: "tool",
        tool_call_id: id,
        content: dedent(`
          The provided input did not match the schema.
          It contains the following errors: ${JSON.stringify(validate.errors)}
        `),
      });

      continue;
    }

    parsedToolCalls.push({ id, name, input: parsedInput });
  }

  if (retryMessages.length > 0) {
    return retry({ retryMessages });
  }

  if (
    firstChoice.finish_reason === "tool_calls" &&
    parsedToolCalls.length === 0
  ) {
    return retry({
      retryMessages: [
        {
          role: "user",
          content: `You indicated "tool_calls" as the finish reason, but no tool calls were made.`,
        },
      ],
    });
  }

  const stopReason = mapOpenAiFinishReasonToLlmStopReason(
    firstChoice.finish_reason,
  );

  if (!openAiResponse.usage) {
    logger.error(`OpenAI returned no usage information for call`);
  } else {
    const { completion_tokens, prompt_tokens, total_tokens } =
      openAiResponse.usage;
    logger.info(
      `Actual usage for iteration: prompt tokens: ${prompt_tokens}, completion tokens: ${completion_tokens}, total tokens: ${total_tokens}`,
    );

    if (estimatedPromptTokens) {
      logger.info(
        `Estimated prompt usage off by ${
          prompt_tokens - estimatedPromptTokens
        } tokens.`,
      );
    }
  }

  const usage = openAiResponse.usage ?? {
    completion_tokens: 0,
    prompt_tokens: 0,
    total_tokens: 0,
  };

  const response: LlmResponse<OpenAiLlmParams> = {
    ...openAiResponse,
    status: "ok",
    stopReason,
    parsedToolCalls,
    usage,
    choices: [firstChoice, ...openAiResponse.choices.slice(1)],
  };

  return response;
};

/**
 * This function sends a request to the Anthropic or OpenAI API based on the
 * `model` provided in the parameters.
 */
export const getLlmResponse = async <T extends LlmParams>(
  params: T,
): Promise<LlmResponse<T>> => {
  if (isLlmParamsAnthropicLlmParams(params)) {
    const response = await getAnthropicResponse(params);

    return response as unknown as LlmResponse<T>;
  } else {
    const response = await getOpenAiResponse(params);

    return response as unknown as LlmResponse<T>;
  }
};
