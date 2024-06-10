import type { Headers } from "@anthropic-ai/sdk/core";
import {
  APIError,
  APIError as BedRockAPIError,
  RateLimitError as BedrockRateLimitError,
  RateLimitError,
} from "@anthropic-ai/sdk/error";
import dedent from "dedent";

import { logger } from "../activity-logger";
import { stringify } from "../stringify";
import type {
  AnthropicMessagesCreateParams,
  AnthropicMessagesCreateResponse,
  AnthropicToolDefinition,
} from "./anthropic-client";
import {
  anthropicMessageModelToMaxOutput,
  anthropicModelToBedrockModel,
  createAnthropicMessagesWithTools,
  isAnthropicContentToolUseContent,
} from "./anthropic-client";
import {
  defaultRateLimitRetryDelay,
  maximumRateLimitRetries,
  maxRetryCount,
} from "./constants";
import type { LlmMessageToolUseContent, LlmUserMessage } from "./llm-message";
import {
  mapAnthropicMessageToLlmMessage,
  mapLlmMessageToAnthropicMessage,
} from "./llm-message";
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

const convertAnthropicRateLimitRequestsResetTimestampToMilliseconds = ({
  anthropicRateLimitRequestsResetTimestamp,
}: {
  anthropicRateLimitRequestsResetTimestamp: string;
}) => {
  const now = new Date();
  const rateLimitEndsAt = new Date(anthropicRateLimitRequestsResetTimestamp);

  const rateLimitEndInMilliseconds = rateLimitEndsAt.getTime() - now.getTime();

  if (rateLimitEndInMilliseconds < 0) {
    return undefined;
  }

  return rateLimitEndInMilliseconds;
};

const throttledStartingDelay = 15_000; // 15 seconds

const getWaitPeriodFromHeaders = (headers?: Headers): number => {
  const tokenResetString = headers?.["anthropic-ratelimit-tokens-reset"];
  const requestResetString = headers?.["anthropic-ratelimit-requests-reset"];

  const tokenReset = tokenResetString
    ? convertAnthropicRateLimitRequestsResetTimestampToMilliseconds({
        anthropicRateLimitRequestsResetTimestamp: tokenResetString,
      })
    : undefined;

  const requestReset = requestResetString
    ? convertAnthropicRateLimitRequestsResetTimestampToMilliseconds({
        anthropicRateLimitRequestsResetTimestamp: requestResetString,
      })
    : undefined;

  if (!tokenReset && !requestReset) {
    return defaultRateLimitRetryDelay;
  }

  return Math.max(tokenReset ?? 0, requestReset ?? 0);
};

const isErrorAnthropicRateLimitingError = (
  error: unknown,
): error is RateLimitError | APIError =>
  error instanceof RateLimitError ||
  error instanceof BedrockRateLimitError ||
  ((error instanceof APIError || error instanceof BedRockAPIError) &&
    error.status === 429);

const isErrorAnthropicThrottlingError = (error: unknown): error is APIError =>
  (error instanceof APIError || error instanceof BedRockAPIError) &&
  !!error.status &&
  /**
   * @todo: This is a temporary solution until we have a better way to
   * determine if the error is caused by throttling.
   */
  error.status >= 500 &&
  error.status < 600;

/**
 * Method for retrying Anthropic request with a starting delay, retrying
 * only if subsequent rate limit errors are encountered.
 */
const createAnthropicMessagesWithToolsWithStartingDelay = async (params: {
  payload: AnthropicMessagesCreateParams;
  startingDelay: number;
  retryCount?: number;
}): Promise<AnthropicMessagesCreateResponse> => {
  const { payload, startingDelay, retryCount = 1 } = params;

  logger.debug(
    `Gracefully handling Anthropic rate limit error by retrying after ${startingDelay}ms for the ${retryCount} time.`,
  );

  try {
    await new Promise((resolve) => {
      setTimeout(resolve, startingDelay);
    });

    const successfulResponse = await createAnthropicMessagesWithTools({
      payload,
      provider: "anthropic",
    });

    return successfulResponse;
  } catch (error) {
    /**
     * If we've reached the maximum number of retries, throw the rate limit error.
     */
    if (params.retryCount === maximumRateLimitRetries) {
      throw error;
    }

    /**
     * @todo: consider retrying with the Amazon Bedrock provider before proceeding
     * with a delayed request to the Anthropic provider
     */

    if (isErrorAnthropicRateLimitingError(error)) {
      const anthropicRateLimitWaitTime = getWaitPeriodFromHeaders(
        error.headers,
      );

      return createAnthropicMessagesWithToolsWithStartingDelay({
        payload,
        startingDelay: anthropicRateLimitWaitTime,
        retryCount: retryCount + 1,
      });
    } else if (isErrorAnthropicThrottlingError(error)) {
      /**
       * If we receive an error which may have been caused by throttling,
       * we should retry the request with a delay (we can't know exactly how long
       * we'll be throttled for, so need to guess).
       */
      return createAnthropicMessagesWithToolsWithStartingDelay({
        payload,
        startingDelay: throttledStartingDelay,
        retryCount: retryCount + 1,
      });
    }

    throw error;
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

  const payload: AnthropicMessagesCreateParams = {
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
  };

  try {
    anthropicResponse = await createAnthropicMessagesWithTools({
      payload,
      provider: "anthropic",
    });

    logger.debug(`Anthropic API response: ${stringify(anthropicResponse)}`);
  } catch (anthropicProviderError) {
    logger.error(`Anthropic API error: ${stringify(anthropicProviderError)}`);

    const compatibleBedrockModel = anthropicModelToBedrockModel[payload.model];

    /**
     * Before retrying the request with a starting delay, try using
     * the Amazon Bedrock provider if the model is available on Bedrock.
     */
    if (
      (isErrorAnthropicRateLimitingError(anthropicProviderError) ||
        isErrorAnthropicThrottlingError(anthropicProviderError)) &&
      compatibleBedrockModel
    ) {
      try {
        anthropicResponse = await createAnthropicMessagesWithTools({
          payload: { ...payload, model: compatibleBedrockModel },
          provider: "amazon-bedrock",
        });
      } catch (bedrockApiError) {
        /**
         * If a rate limit error or throttling error was also encountered
         * with the Amazon Bedrock provider, then retry with the anthropic
         * provider and a starting delay.
         */
        if (
          isErrorAnthropicRateLimitingError(bedrockApiError) ||
          isErrorAnthropicThrottlingError(bedrockApiError)
        ) {
          const startingDelay = isErrorAnthropicRateLimitingError(
            anthropicProviderError,
          )
            ? getWaitPeriodFromHeaders(anthropicProviderError.headers)
            : throttledStartingDelay;

          anthropicResponse =
            await createAnthropicMessagesWithToolsWithStartingDelay({
              payload,
              startingDelay,
            });
        } else {
          return {
            status: "api-error",
            anthropicApiError:
              bedrockApiError instanceof BedRockAPIError
                ? bedrockApiError
                : undefined,
          };
        }
      }
    } else if (isErrorAnthropicRateLimitingError(anthropicProviderError)) {
      const anthropicRateLimitWaitTime = getWaitPeriodFromHeaders(
        anthropicProviderError.headers,
      );

      anthropicResponse =
        await createAnthropicMessagesWithToolsWithStartingDelay({
          payload,
          startingDelay: anthropicRateLimitWaitTime,
        });
    } else if (isErrorAnthropicThrottlingError(anthropicProviderError)) {
      anthropicResponse =
        await createAnthropicMessagesWithToolsWithStartingDelay({
          payload,
          startingDelay: throttledStartingDelay,
        });
    }

    return {
      status: "api-error",
      anthropicApiError:
        anthropicProviderError instanceof APIError
          ? anthropicProviderError
          : undefined,
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
