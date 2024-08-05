import type { Headers } from "@anthropic-ai/sdk/core";
import type { APIError, RateLimitError } from "@anthropic-ai/sdk/error";
import type { Tool } from "@anthropic-ai/sdk/resources/messages";
import dedent from "dedent";
import { backOff } from "exponential-backoff";

import { logger } from "../activity-logger.js";
import { stringify } from "../stringify.js";
import type {
  AnthropicApiProvider,
  AnthropicMessagesCreateParams,
  AnthropicMessagesCreateResponse,
} from "./anthropic-client.js";
import {
  anthropicMessageModelToMaxOutput,
  createAnthropicMessagesWithTools,
  isAnthropicContentToolUseBlock,
} from "./anthropic-client.js";
import {
  defaultRateLimitRetryDelay,
  maximumExponentialBackoffRetries,
  maximumRateLimitRetries,
  maxRetryCount,
  serverErrorRetryStartingDelay,
} from "./constants.js";
import type {
  LlmMessageToolUseContent,
  LlmUserMessage,
} from "./llm-message.js";
import {
  mapAnthropicMessageToLlmMessage,
  mapLlmMessageToAnthropicMessage,
} from "./llm-message.js";
import type {
  AnthropicLlmParams,
  AnthropicResponse,
  LlmResponse,
  LlmStopReason,
  LlmToolDefinition,
  LlmUsage,
  ParsedLlmToolCall,
} from "./types.js";
import {
  getInputValidationErrors,
  sanitizeInputBeforeValidation,
} from "./validation.js";

const mapLlmToolDefinitionToAnthropicToolDefinition = (
  tool: LlmToolDefinition,
): Tool => ({
  name: tool.name,
  description: tool.description,
  input_schema: tool.inputSchema,
});

const parseToolCallsFromAnthropicResponse = (
  response: AnthropicMessagesCreateResponse,
): ParsedLlmToolCall[] =>
  response.content
    .filter(isAnthropicContentToolUseBlock)
    .map(({ id, name, input }) => ({ id, name, input: input as object }));

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
): error is RateLimitError =>
  typeof error === "object" &&
  !!error &&
  "status" in error &&
  error.status === 429;

const isServerError = (error: unknown): error is APIError =>
  typeof error === "object" &&
  !!error &&
  "status" in error &&
  typeof error.status === "number" &&
  error.status >= 500 &&
  error.status < 600;

const switchProvider = (
  provider: AnthropicApiProvider,
): AnthropicApiProvider =>
  provider === "anthropic" ? "amazon-bedrock" : "anthropic";

const createAnthropicMessagesWithToolsWithBackoff = async (params: {
  payload: AnthropicMessagesCreateParams;
  initialProvider?: AnthropicApiProvider;
  retryCount?: number;
  priorRateLimitError?: Partial<Record<AnthropicApiProvider, RateLimitError>>;
}): Promise<AnthropicMessagesCreateResponse> => {
  const {
    payload,
    retryCount = 1,
    initialProvider = "anthropic",
    priorRateLimitError,
  } = params;

  let currentProvider: AnthropicApiProvider = initialProvider;

  try {
    const response = await backOff(
      () =>
        createAnthropicMessagesWithTools({
          payload,
          provider: currentProvider,
        }),
      {
        startingDelay: serverErrorRetryStartingDelay,
        jitter: "full",
        numOfAttempts: maximumExponentialBackoffRetries,
        retry: (error) => {
          /**
           * Only retry further requests with an exponential back-off if a server error
           * was encountered.
           */
          logger.error(stringify({ currentProvider, ...response }));

          if (isServerError(error)) {
            const otherProvider = switchProvider(currentProvider);
            const priorRateLimitErrorForOtherProvider =
              priorRateLimitError?.[otherProvider];

            /**
             * We only retry the request with the other provider if we didn't previously
             * encounter a rate limit error with the other provider.
             *
             * Otherwise we will most likely immediately encounter the rate limit.
             */
            logger.debug(
              `Encountered server error with provider "${currentProvider}", retrying with exponential backoff with provider "${
                priorRateLimitErrorForOtherProvider
                  ? currentProvider
                  : otherProvider
              }".`,
            );
            if (!priorRateLimitErrorForOtherProvider) {
              currentProvider = otherProvider;
            }

            return true;
          }

          return false;
        },
      },
    );

    logger.debug(stringify({ currentProvider, ...response }));

    return response;
  } catch (currentProviderError) {
    if (
      isErrorAnthropicRateLimitingError(currentProviderError) &&
      retryCount < maximumRateLimitRetries
    ) {
      const otherProvider = switchProvider(currentProvider);

      if (!priorRateLimitError) {
        /**
         * If we didn't previously encounter a rate limit with any provider,
         * we can directly retry the request with the other provider.
         */
        logger.debug(
          `Encountered rate limit error with provider "${currentProvider}", retrying directly with provider "${otherProvider}".`,
        );
        return createAnthropicMessagesWithToolsWithBackoff({
          payload,
          initialProvider: otherProvider,
          retryCount: retryCount + 1,
          priorRateLimitError: {
            [currentProvider]: currentProviderError,
          },
        });
      }

      const otherProviderPriorRateLimitError =
        priorRateLimitError[otherProvider];

      if (otherProviderPriorRateLimitError) {
        /**
         * If we have now encountered a rate limit with both providers,
         * we need to wait for the smaller of the two starting delays
         * before retrying the request with the corresponding provider.
         */
        const currentProviderStartingDelay = getWaitPeriodFromHeaders(
          currentProviderError.headers,
        );

        const otherProviderStartingDelay = getWaitPeriodFromHeaders(
          otherProviderPriorRateLimitError.headers,
        );

        const smallerStartingDelay = Math.min(
          currentProviderStartingDelay,
          otherProviderStartingDelay,
        );

        const smallerStartingDelayProvider =
          currentProviderStartingDelay < otherProviderStartingDelay
            ? currentProvider
            : otherProvider;

        logger.debug(
          `Encountered rate limit error with both providers "${currentProvider}" and "${otherProvider}", delaying request for provider "${smallerStartingDelayProvider}" until the rate limit wait period has ended.`,
        );

        if (smallerStartingDelay > 0) {
          await new Promise((resolve) => {
            setTimeout(resolve, smallerStartingDelay);
          });
        }

        return createAnthropicMessagesWithToolsWithBackoff({
          payload,
          initialProvider: smallerStartingDelayProvider,
          retryCount: retryCount + 1,
          priorRateLimitError: {
            [currentProvider]: currentProviderError,
            [otherProvider]: otherProviderPriorRateLimitError,
          },
        });
      }
    }

    throw currentProviderError;
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
    anthropicResponse = await createAnthropicMessagesWithToolsWithBackoff({
      payload,
    });
  } catch (error) {
    return {
      status: "api-error",
      error,
    };
  }

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

  const currentRequestTime = Date.now() - timeBeforeRequest;

  const lastRequestTime = currentRequestTime;
  const totalRequestTime =
    previousInvalidResponses?.reduce(
      (acc, { requestTime }) => acc + requestTime,
      currentRequestTime,
    ) ?? currentRequestTime;

  if (anthropicResponse.stop_reason === "max_tokens") {
    return {
      status: "exceeded-maximum-output-tokens",
      lastRequestTime,
      totalRequestTime,
      requestMaxTokens: maxTokens,
      response: anthropicResponse,
      usage,
    };
  }

  const retry = async (retryParams: {
    successfullyParsedToolCalls: ParsedLlmToolCall<ToolName>[];
    retryMessageContent: LlmUserMessage["content"];
  }): Promise<LlmResponse<AnthropicLlmParams>> => {
    if (retryCount > maxRetryCount) {
      return {
        status: "exceeded-maximum-retries",
        invalidResponses: previousInvalidResponses ?? [],
        lastRequestTime,
        totalRequestTime,
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
