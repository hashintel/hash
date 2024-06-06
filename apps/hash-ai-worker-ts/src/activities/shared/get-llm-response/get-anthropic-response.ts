import dedent from "dedent";

import { logger } from "../activity-logger";
import { stringify } from "../stringify";
import type {
  AnthropicMessagesCreateResponse,
  AnthropicToolDefinition,
} from "./anthropic-client";
import {
  anthropicMessageModelToMaxOutput,
  createAnthropicMessagesWithTools,
  isAnthropicContentToolUseContent,
} from "./anthropic-client";
import type { LlmMessageToolUseContent, LlmUserMessage } from "./llm-message";
import {
  mapAnthropicMessageToLlmMessage,
  mapLlmMessageToAnthropicMessage,
} from "./llm-message";
import { maxRetryCount } from "./max-retry-count";
import type {
  AnthropicLlmParams,
  AnthropicResponse,
  LlmResponse,
  LlmStopReason,
  LlmToolDefinition,
  LlmUsage,
  ParsedLlmToolCall,
} from "./types";
import {
  getInputValidationErrors,
  sanitizeInputBeforeValidation,
} from "./validation";

const mapLlmToolDefinitionToAnthropicToolDefinition = (
  tool: LlmToolDefinition,
): AnthropicToolDefinition => ({
  name: tool.name,
  description: tool.description,
  input_schema: tool.inputSchema,
});

const parseToolCallsFromAnthropicResponse = (
  response: AnthropicMessagesCreateResponse,
): ParsedLlmToolCall[] =>
  response.content
    .filter(isAnthropicContentToolUseContent)
    .map(({ id, name, input }) => ({ id, name, input }));

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

export const getAnthropicResponse = async <ToolName extends string>(
  params: AnthropicLlmParams<ToolName>,
): Promise<LlmResponse<AnthropicLlmParams>> => {
  const {
    tools,
    messages,
    systemPrompt,
    previousInvalidResponses,
    retryContext,
    toolChoice,
    ...remainingParams
  } = params;

  const anthropicTools = tools?.map(
    mapLlmToolDefinitionToAnthropicToolDefinition,
  );

  const anthropicMessages = messages.map((message) =>
    mapLlmMessageToAnthropicMessage({ message }),
  );

  /**
   * Default to the maximum context window, if `max_tokens` is not provided.
   */
  const maxTokens =
    params.maxTokens ?? anthropicMessageModelToMaxOutput[params.model];

  let anthropicResponse: AnthropicMessagesCreateResponse;

  const timeBeforeRequest = Date.now();

  try {
    anthropicResponse = await createAnthropicMessagesWithTools({
      ...remainingParams,
      system: systemPrompt,
      messages: anthropicMessages,
      max_tokens: maxTokens,
      tools: anthropicTools,
      tool_choice: toolChoice
        ? toolChoice === "required"
          ? { type: "any" }
          : { type: "tool", name: toolChoice }
        : undefined,
    });

    logger.debug(`Anthropic API response: ${stringify(anthropicResponse)}`);
  } catch (error) {
    logger.error(`Anthropic API error: ${stringify(error)}`);

    return {
      status: "api-error",
    };
  }

  const currentRequestTime = Date.now() - timeBeforeRequest;

  const { previousUsage, retryCount = 0 } = retryContext ?? {};

  const usage: LlmUsage = {
    inputTokens:
      (previousUsage?.inputTokens ?? 0) + anthropicResponse.usage.input_tokens,
    outputTokens:
      (previousUsage?.outputTokens ?? 0) +
      anthropicResponse.usage.output_tokens,
    totalTokens:
      (previousUsage?.totalTokens ?? 0) +
      anthropicResponse.usage.input_tokens +
      anthropicResponse.usage.output_tokens,
  };

  const retry = async (retryParams: {
    successfullyParsedToolCalls: ParsedLlmToolCall<ToolName>[];
    retryMessageContent: LlmUserMessage["content"];
  }): Promise<LlmResponse<AnthropicLlmParams>> => {
    if (retryCount > maxRetryCount) {
      return {
        status: "exceeded-maximum-retries",
        invalidResponses: previousInvalidResponses ?? [],
        usage,
      };
    }

    const responseMessage = mapAnthropicMessageToLlmMessage({
      anthropicMessage: {
        ...anthropicResponse,
        /**
         * Filter out the tool calls that were successfully parsed,
         * as we won't have a response for the tool call in the retried
         * request.
         */
        content: anthropicResponse.content.filter(
          (messageContent) =>
            !(
              messageContent.type === "tool_use" &&
              retryParams.successfullyParsedToolCalls.some(
                (successFullToolCall) =>
                  successFullToolCall.id === messageContent.id,
              )
            ),
        ),
      },
    });

    return getAnthropicResponse({
      ...params,
      messages: [
        ...params.messages,
        responseMessage,
        {
          role: "user",
          content: retryParams.retryMessageContent,
        },
      ],
      previousInvalidResponses: [
        ...(previousInvalidResponses ?? []),
        { ...anthropicResponse, requestTime: currentRequestTime },
      ],
      retryContext: {
        retryCount: retryCount + 1,
        previousUsage: usage,
        previousSuccessfulToolCalls: [
          ...(retryContext?.previousSuccessfulToolCalls ?? []),
          ...retryParams.successfullyParsedToolCalls,
        ],
      },
    });
  };

  const parsedToolCalls: ParsedLlmToolCall<ToolName>[] = [];

  const unvalidatedParsedToolCalls =
    parseToolCallsFromAnthropicResponse(anthropicResponse);

  const stopReason = mapAnthropicStopReasonToLlmStopReason(
    anthropicResponse.stop_reason,
  );

  if (stopReason === "tool_use" && unvalidatedParsedToolCalls.length > 0) {
    const retryMessageContent: LlmUserMessage["content"] = [];

    for (const toolCall of unvalidatedParsedToolCalls) {
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

      const sanitizedInput = sanitizeInputBeforeValidation({
        input: toolCall.input,
        toolDefinition,
      });

      const validationErrors = getInputValidationErrors({
        input: sanitizedInput,
        toolDefinition,
      });

      if (validationErrors) {
        retryMessageContent.push({
          type: "tool_result",
          tool_use_id: toolCall.id,
          content: dedent(`
            The provided input did not match the schema.
            It contains the following errors: ${stringify(validationErrors)}
          `),
          is_error: true,
        });

        continue;
      }

      parsedToolCalls.push({
        ...toolCall,
        name: toolCall.name as ToolName,
        input: sanitizedInput,
      });
    }

    if (retryMessageContent.length > 0) {
      return retry({
        successfullyParsedToolCalls: parsedToolCalls,
        retryMessageContent,
      });
    }
  }

  const message = mapAnthropicMessageToLlmMessage({
    anthropicMessage: anthropicResponse,
  });

  if (message.role === "user") {
    throw new Error("Unexpected user message in response");
  }

  /**
   * If we previously retried the request with incorrect tool calls,
   * we need to include the previous successful tool calls in the
   * response message, which may have been previously filtered out.
   */
  if (retryContext) {
    const previousSuccessfulToolUses =
      retryContext.previousSuccessfulToolCalls.map<
        LlmMessageToolUseContent<ToolName>
      >(({ id, input, name }) => ({ type: "tool_use", id, input, name }));

    message.content.push(...previousSuccessfulToolUses);
  }

  return {
    ...anthropicResponse,
    status: "ok",
    stopReason,
    message,
    usage,
    invalidResponses: previousInvalidResponses ?? [],
    lastRequestTime: currentRequestTime,
    totalRequestTime:
      previousInvalidResponses?.reduce(
        (acc, { requestTime }) => acc + requestTime,
        currentRequestTime,
      ) ?? currentRequestTime,
  };
};
