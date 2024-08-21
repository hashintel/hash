import { stringifyError } from "@local/hash-isomorphic-utils/stringify-error";
import { Context } from "@temporalio/activity";
import dedent from "dedent";
import { backOff } from "exponential-backoff";
import type { OpenAI } from "openai";
import type { Headers } from "openai/core";
import { APIError, RateLimitError } from "openai/error";
import { promptTokensEstimate } from "openai-chat-tokens";

import { logger } from "../activity-logger.js";
import { isActivityCancelled } from "../get-flow-context.js";
import { modelToContextWindow, openai } from "../openai-client.js";
import { stringify } from "../stringify.js";
import {
  defaultRateLimitRetryDelay,
  maximumExponentialBackoffRetries,
  maximumRateLimitRetries,
  maxRetryCount,
  serverErrorRetryStartingDelay,
} from "./constants.js";
import type {
  LlmAssistantMessage,
  LlmMessageToolUseContent,
  LlmUserMessage,
} from "./llm-message.js";
import {
  mapLlmMessageToOpenAiMessages,
  mapOpenAiMessagesToLlmMessages,
} from "./llm-message.js";
import { logLlmRequest, logLlmServerError } from "./log-llm-request.js";
import type {
  LlmRequestMetadata,
  LlmResponse,
  LlmStopReason,
  LlmToolDefinition,
  LlmUsage,
  OpenAiLlmParams,
  ParsedLlmToolCall,
} from "./types.js";
import {
  getInputValidationErrors,
  sanitizeInputBeforeValidation,
} from "./validation.js";

const mapLlmToolDefinitionToOpenAiToolDefinition = (
  tool: LlmToolDefinition,
): OpenAI.Chat.Completions.ChatCompletionTool => ({
  type: "function",
  function: {
    /**
     * Ideally we would enable 'strict' mode, but this enforces that every object in a tool definition return
     * specifies a 'required' array that lists _all_ properties, i.e. you cannot have an object with optional properties.
     * @todo H-3227 we can work around this by making all optional properties be 'or null' instead.
     *
     * @see https://openai.com/index/introducing-structured-outputs-in-the-api/ for strict mode introduction blog
     */
    strict: false,
    name: tool.name,
    parameters: tool.inputSchema as OpenAI.FunctionParameters,
    description: tool.description,
  },
});

const mapOpenAiFinishReasonToLlmStopReason = (
  finishReason: OpenAI.ChatCompletion["choices"][0]["finish_reason"],
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

/**
 * Converts a string into milliseconds, supporting strings in the formats: `5ms`, `5s`, `5m`, `5h`.
 */
const convertOpenAiTimeStringToMilliseconds = (timeString: string): number => {
  const timeValue = parseFloat(timeString);
  const unit = timeString.match(/[a-zA-Z]+/)?.[0];

  if (!unit) {
    throw new Error("Invalid time format");
  }

  switch (unit) {
    case "ms":
      return timeValue;
    case "s":
      return timeValue * 1000;
    case "m":
      return timeValue * 1000 * 60;
    case "h":
      return timeValue * 1000 * 60 * 60;
    default:
      throw new Error(`Unsupported time unit: ${unit}`);
  }
};

const getWaitPeriodFromHeaders = (headers?: Headers): number => {
  const tokenReset = headers?.["x-ratelimit-reset-tokens"];
  const requestReset = headers?.["x-ratelimit-reset-requests"];
  if (!tokenReset && !requestReset) {
    return defaultRateLimitRetryDelay;
  }

  if (!tokenReset) {
    return convertOpenAiTimeStringToMilliseconds(requestReset!);
  }
  if (!requestReset) {
    return convertOpenAiTimeStringToMilliseconds(tokenReset);
  }
  return Math.max(
    convertOpenAiTimeStringToMilliseconds(requestReset),
    convertOpenAiTimeStringToMilliseconds(tokenReset),
  );
};

const isServerError = (error: unknown): error is APIError =>
  error instanceof APIError &&
  !!error.status &&
  error.status >= 500 &&
  error.status < 600;

const openAiChatCompletionWithBackoff = async (params: {
  completionPayload: OpenAI.ChatCompletionCreateParamsNonStreaming;
  metadata: LlmRequestMetadata;
  retryCount?: number;
}): Promise<OpenAI.ChatCompletion> => {
  const { completionPayload, metadata, retryCount = 0 } = params;

  const timeBeforeRequest = Date.now();

  try {
    return await backOff(
      () =>
        openai.chat.completions.create(completionPayload, {
          signal: Context.current().cancellationSignal,
        }),
      {
        startingDelay: serverErrorRetryStartingDelay,
        jitter: "full",
        numOfAttempts: maximumExponentialBackoffRetries,
        retry: (error) => {
          const timeAfterRequest = Date.now();

          const numberOfSeconds = (timeAfterRequest - timeBeforeRequest) / 1000;

          logLlmServerError({
            ...metadata,
            provider: "openai",
            response: error as unknown,
            request: completionPayload,
            secondsTaken: numberOfSeconds,
          });

          /**
           * Only retry further requests with an exponential back-off if a server error
           * was encountered.
           */
          if (isServerError(error)) {
            logger.debug(
              `Encountered server error with OpenAI, retrying with exponential backoff.`,
            );
            return true;
          }

          return false;
        },
      },
    );
  } catch (error) {
    if (
      error instanceof RateLimitError &&
      retryCount < maximumRateLimitRetries
    ) {
      logger.debug(
        `Encountered rate limit error with OpenAI provider, delaying retry request until the rate limit wait period has ended.`,
      );
      const startingDelay = getWaitPeriodFromHeaders(error.headers);

      if (startingDelay) {
        await new Promise((resolve) => {
          setTimeout(resolve, startingDelay);
        });
      }

      return openAiChatCompletionWithBackoff({
        completionPayload,
        metadata,
        retryCount: retryCount + 1,
      });
    }

    throw error;
  }
};

export const getOpenAiResponse = async <ToolName extends string>(
  params: OpenAiLlmParams<ToolName>,
  metadata: LlmRequestMetadata,
): Promise<LlmResponse<OpenAiLlmParams>> => {
  const {
    tools,
    trimMessageAtIndex,
    messages,
    systemPrompt,
    previousInvalidResponses,
    retryContext,
    toolChoice,
    ...remainingParams
  } = params;

  const openAiTools = tools?.map(mapLlmToolDefinitionToOpenAiToolDefinition);

  const openAiMessages: OpenAI.ChatCompletionMessageParam[] = [
    ...(systemPrompt
      ? [
          {
            role: "system" as const,
            content: systemPrompt,
          },
        ]
      : []),
    ...messages.flatMap((message) =>
      mapLlmMessageToOpenAiMessages({ message }),
    ),
  ];

  const completionPayload: OpenAI.ChatCompletionCreateParamsNonStreaming = {
    ...remainingParams,
    messages: openAiMessages,
    tools: openAiTools,
    stream: false,
    /**
     * Return `logprobs` by default when in development mode, unless
     * explicitly overridden by the caller.
     */
    logprobs:
      remainingParams.logprobs ?? process.env.NODE_ENV === "development",
    tool_choice: toolChoice
      ? toolChoice === "required"
        ? "required"
        : { type: "function", function: { name: toolChoice } }
      : undefined,
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
        messages: openAiMessages,
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

  let openAiResponse: OpenAI.ChatCompletion;

  const timeBeforeRequest = Date.now();

  try {
    openAiResponse = await openAiChatCompletionWithBackoff({
      completionPayload,
      metadata,
    });
  } catch (error) {
    logger.error(`OpenAI API error: ${stringifyError(error)}`);

    return {
      status: isActivityCancelled() ? "aborted" : "api-error",
      provider: "openai",
      error,
    };
  }

  const currentRequestTime = Date.now() - timeBeforeRequest;

  const { previousUsage, retryCount = 0 } = retryContext ?? {};

  const usage: LlmUsage = {
    inputTokens:
      (previousUsage?.inputTokens ?? 0) +
      (openAiResponse.usage?.prompt_tokens ?? 0),
    outputTokens:
      (previousUsage?.outputTokens ?? 0) +
      (openAiResponse.usage?.completion_tokens ?? 0),
    totalTokens:
      (previousUsage?.totalTokens ?? 0) +
      (openAiResponse.usage?.total_tokens ?? 0),
  };

  const lastRequestTime = currentRequestTime;
  const totalRequestTime =
    previousInvalidResponses?.reduce(
      (acc, { requestTime }) => acc + requestTime,
      currentRequestTime,
    ) ?? currentRequestTime;

  /**
   * @todo: consider accounting for `choices` in the unified LLM response
   */
  const firstChoice = openAiResponse.choices[0];

  const stopReason = !firstChoice
    ? "stop"
    : mapOpenAiFinishReasonToLlmStopReason(firstChoice.finish_reason);

  const retry = async (retryParams: {
    successfullyParsedToolCalls: ParsedLlmToolCall<ToolName>[];
    retryMessageContent: LlmUserMessage["content"];
  }): Promise<LlmResponse<OpenAiLlmParams>> => {
    if (retryCount > maxRetryCount) {
      return {
        status: "exceeded-maximum-retries",
        provider: "openai",
        invalidResponses: previousInvalidResponses ?? [],
        lastRequestTime,
        totalRequestTime,
        usage,
      };
    }

    const openAiResponseMessage = openAiResponse.choices[0]?.message;

    const responseMessages = openAiResponseMessage
      ? mapOpenAiMessagesToLlmMessages({
          messages: [
            {
              ...openAiResponseMessage,
              /**
               * Filter out the tool calls that were successfully parsed,
               * as we won't have a response for the tool call in the retried
               * request.
               */
              tool_calls: openAiResponseMessage.tool_calls?.filter(
                (toolCall) =>
                  !retryParams.successfullyParsedToolCalls.some(
                    (parsedToolCall) => parsedToolCall.id === toolCall.id,
                  ),
              ),
            },
          ],
        })
      : undefined;

    logLlmRequest({
      ...metadata,
      finalized: false,
      provider: "openai",
      secondsTaken: currentRequestTime,
      request: params,
      response: {
        status: "ok",
        provider: "openai",
        model: openAiResponse.model,
        id: openAiResponse.id,
        created: openAiResponse.created,
        message: (responseMessages?.[0] ?? {}) as LlmAssistantMessage,
        stopReason,
        usage,
        invalidResponses: previousInvalidResponses ?? [],
        lastRequestTime: currentRequestTime,
        totalRequestTime:
          previousInvalidResponses?.reduce(
            (acc, { requestTime }) => acc + requestTime,
            currentRequestTime,
          ) ?? currentRequestTime,
      },
    });

    logger.debug(
      `Retrying OpenAI call with the following retry message content: ${stringify(
        retryParams.retryMessageContent,
      )}`,
    );

    return getOpenAiResponse(
      {
        ...params,
        messages: [
          ...params.messages,
          ...(responseMessages ?? []),
          {
            role: "user",
            content: retryParams.retryMessageContent,
          },
        ],
        previousInvalidResponses: [
          ...(previousInvalidResponses ?? []),
          { ...openAiResponse, requestTime: currentRequestTime },
        ],
        retryContext: {
          retryCount: retryCount + 1,
          previousSuccessfulToolCalls: [
            ...(retryContext?.previousSuccessfulToolCalls ?? []),
            ...retryParams.successfullyParsedToolCalls,
          ],
          previousUsage: usage,
        },
      },
      metadata,
    );
  };

  if (!firstChoice) {
    return retry({
      successfullyParsedToolCalls: [],
      retryMessageContent: [
        {
          type: "text",
          text: "No response was provided by the model",
        },
      ],
    });
  }

  if (firstChoice.finish_reason === "length") {
    return {
      status: "max-tokens",
      provider: "openai",
      response: openAiResponse,
      requestMaxTokens: params.max_tokens ?? undefined,
      lastRequestTime,
      totalRequestTime,
      usage,
    };
  }

  const parsedToolCalls: ParsedLlmToolCall<ToolName>[] = [];

  const retryMessageContent: LlmUserMessage["content"] = [];

  for (const openAiToolCall of firstChoice.message.tool_calls ?? []) {
    const {
      id,
      function: { name, arguments: functionArguments },
    } = openAiToolCall;

    const toolDefinition = tools?.find((tool) => tool.name === name);

    if (!toolDefinition) {
      retryMessageContent.push({
        type: "tool_result",
        tool_use_id: id,
        content: "Tool not found",
        is_error: true,
      });

      continue;
    }

    let parsedInput: object | undefined = undefined;

    try {
      parsedInput = JSON.parse(functionArguments) as object;
    } catch (error) {
      retryMessageContent.push({
        type: "tool_result",
        tool_use_id: id,
        content: `Your JSON arguments could not be parsed – the parsing function errored: ${
          (error as Error).message
        }. Please try again.`,
      });

      continue;
    }

    const sanitizedInput = sanitizeInputBeforeValidation({
      input: parsedInput,
      toolDefinition,
    });

    const validationErrors = getInputValidationErrors({
      input: sanitizedInput,
      requestId: metadata.requestId,
      toolDefinition,
    });

    if (validationErrors) {
      retryMessageContent.push({
        type: "tool_result",
        tool_use_id: id,
        content: dedent(`
          The provided input did not match the schema.
          It contains the following errors: ${JSON.stringify(validationErrors)}
        `),
      });

      continue;
    }

    parsedToolCalls.push({ id, name: name as ToolName, input: sanitizedInput });
  }

  if (retryMessageContent.length > 0) {
    return retry({
      successfullyParsedToolCalls: parsedToolCalls,
      retryMessageContent,
    });
  }

  if (
    firstChoice.finish_reason === "tool_calls" &&
    parsedToolCalls.length === 0
  ) {
    return retry({
      successfullyParsedToolCalls: [],
      retryMessageContent: [
        {
          type: "text",
          text: `You indicated "tool_calls" as the finish reason, but no tool calls were made.`,
        },
      ],
    });
  }

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

  const responseMessages = mapOpenAiMessagesToLlmMessages({
    messages: [firstChoice.message],
  });

  if (responseMessages.length > 1) {
    throw new Error("Unexpected multiple messages in response");
  }

  const responseMessage = responseMessages[0];

  if (!responseMessage) {
    throw new Error("Unexpected missing message in response");
  }

  if (responseMessage.role === "user") {
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

    responseMessage.content.push(...previousSuccessfulToolUses);
  }

  const response: LlmResponse<OpenAiLlmParams> = {
    model: openAiResponse.model,
    id: openAiResponse.id,
    created: openAiResponse.created,
    status: "ok",
    provider: "openai",
    message: responseMessage,
    stopReason,
    usage,
    invalidResponses: previousInvalidResponses ?? [],
    lastRequestTime: currentRequestTime,
    totalRequestTime:
      previousInvalidResponses?.reduce(
        (acc, { requestTime }) => acc + requestTime,
        currentRequestTime,
      ) ?? currentRequestTime,
  };

  return response;
};
