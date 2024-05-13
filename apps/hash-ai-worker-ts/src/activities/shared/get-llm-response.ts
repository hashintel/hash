import { getHashInstanceAdminAccountGroupId } from "@local/hash-backend-utils/hash-instance";
import { createUsageRecord } from "@local/hash-backend-utils/service-usage";
import type { EntityMetadata, GraphApi } from "@local/hash-graph-client";
import { systemLinkEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import type { AccountId, EntityId, OwnedById } from "@local/hash-subgraph";
import { StatusCode } from "@local/status";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { isAxiosError } from "axios";
import dedent from "dedent";
import type OpenAI from "openai";
import type { JSONSchema } from "openai/lib/jsonschema";
import type {
  ChatCompletion,
  ChatCompletion as OpenAiChatCompletion,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionMessageParam,
  FunctionParameters as OpenAiFunctionParameters,
} from "openai/resources";
import { promptTokensEstimate } from "openai-chat-tokens";

import { getAiAssistantAccountIdActivity } from "../get-ai-assistant-account-id-activity";
import { userExceededServiceUsageLimitActivity } from "../user-exceeded-service-usage-limit-activity";
import { logger } from "./activity-logger";
import type {
  AnthropicMessagesCreateResponse,
  AnthropicToolDefinition,
} from "./get-llm-response/anthropic-client";
import {
  anthropicMessageModelToMaxOutput,
  createAnthropicMessagesWithTools,
  isAnthropicContentToolUseContent,
} from "./get-llm-response/anthropic-client";
import type { LlmUserMessage } from "./get-llm-response/llm-message";
import {
  mapAnthropicMessageToLlmMessage,
  mapLlmMessageToAnthropicMessage,
  mapLlmMessageToOpenAiMessages,
  mapOpenAiMessagesToLlmMessages,
} from "./get-llm-response/llm-message";
import { logLlmRequest } from "./get-llm-response/log-llm-request";
import type {
  AnthropicLlmParams,
  AnthropicResponse,
  LlmParams,
  LlmResponse,
  LlmStopReason,
  LlmToolDefinition,
  LlmUsage,
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
  response: AnthropicMessagesCreateResponse,
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

const sanitizeInputBeforeValidation = (params: {
  input: object;
  toolDefinition: LlmToolDefinition;
}): object => {
  const { input, toolDefinition } = params;

  if (toolDefinition.sanitizeInputBeforeValidation) {
    try {
      const sanitizedInput =
        toolDefinition.sanitizeInputBeforeValidation(input);

      return sanitizedInput;
    } catch {
      /**
       * If an error occurs during sanitization, it likely means that the
       * sanitization function doesn't handle some incorrect version of the
       * input. In this case, we can proceed to the JSON Schema validation
       * step which should produce a more informative error message for the LLM.
       */
      logger.error(
        `Error sanitizing input before validation: ${stringify(input)}`,
      );
    }
  }

  return input;
};

const ajv = new Ajv();

addFormats(ajv);

const applyAdditionalPropertiesFalseToSchema = (params: {
  schema: JSONSchema;
}): JSONSchema => {
  const { schema } = params;

  if (typeof schema !== "object") {
    return schema;
  }

  if (schema.type === "object") {
    const updatedProperties = schema.properties
      ? Object.fromEntries(
          Object.entries(schema.properties).map(([key, value]) => [
            key,
            typeof value === "object"
              ? applyAdditionalPropertiesFalseToSchema({ schema: value })
              : value,
          ]),
        )
      : {};

    const updatedPatternProperties = schema.patternProperties
      ? Object.fromEntries(
          Object.entries(schema.patternProperties).map(([key, value]) => [
            key,
            typeof value === "object"
              ? applyAdditionalPropertiesFalseToSchema({ schema: value })
              : value,
          ]),
        )
      : {};

    return {
      ...schema,
      properties: updatedProperties,
      patternProperties: updatedPatternProperties,
      additionalProperties: false,
    };
  } else if (schema.type === "array" && schema.items) {
    return {
      ...schema,
      items:
        typeof schema.items === "object"
          ? Array.isArray(schema.items)
            ? schema.items.map((value) =>
                typeof value === "object"
                  ? applyAdditionalPropertiesFalseToSchema({ schema: value })
                  : value,
              )
            : applyAdditionalPropertiesFalseToSchema({ schema: schema.items })
          : schema.items,
    };
  }

  return schema;
};

const getInputValidationErrors = (params: {
  input: object;
  toolDefinition: LlmToolDefinition;
}) => {
  const { input, toolDefinition } = params;

  const validate = ajv.compile(
    applyAdditionalPropertiesFalseToSchema({
      schema: toolDefinition.inputSchema,
    }),
  );

  const inputIsValid = validate(input);

  if (!inputIsValid) {
    logger.error(
      `Input did not match schema: ${stringify(validate.errors)} for tool: ${toolDefinition.name}`,
    );

    return validate.errors ?? [];
  }

  return null;
};

const maxRetryCount = 3;

const getAnthropicResponse = async (
  params: AnthropicLlmParams,
): Promise<LlmResponse<AnthropicLlmParams>> => {
  const {
    tools,
    retryCount = 0,
    messages,
    systemPrompt,
    previousUsage,
    previousInvalidResponses,
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
    });

    logger.debug(`Anthropic API response: ${stringify(anthropicResponse)}`);
  } catch (error) {
    logger.error(`Anthropic API error: ${stringify(error)}`);

    return {
      status: "api-error",
    };
  }

  const currentRequestTime = Date.now() - timeBeforeRequest;

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
    retryMessageContent: LlmUserMessage["content"];
  }): Promise<LlmResponse<AnthropicLlmParams>> => {
    if (retryCount > maxRetryCount) {
      return {
        status: "exceeded-maximum-retries",
        usage,
      };
    }

    return getAnthropicResponse({
      ...params,
      retryCount: retryCount + 1,
      messages: [
        ...params.messages,
        mapAnthropicMessageToLlmMessage({
          anthropicMessage: anthropicResponse,
        }),
        {
          role: "user",
          content: retryParams.retryMessageContent,
        },
      ],
      previousInvalidResponses: [
        ...(previousInvalidResponses ?? []),
        { ...anthropicResponse, requestTime: currentRequestTime },
      ],
    });
  };

  const parsedToolCalls: ParsedLlmToolCall[] = [];

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
      }

      parsedToolCalls.push({ ...toolCall, input: sanitizedInput });
    }

    if (retryMessageContent.length > 0) {
      return retry({ retryMessageContent });
    }
  }

  const message = mapAnthropicMessageToLlmMessage({
    anthropicMessage: anthropicResponse,
  });

  if (message.role === "user") {
    throw new Error("Unexpected user message in response");
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

const getOpenAiResponse = async (
  params: OpenAiLlmParams,
): Promise<LlmResponse<OpenAiLlmParams>> => {
  const {
    tools,
    trimMessageAtIndex,
    retryCount = 0,
    messages,
    systemPrompt,
    previousUsage,
    previousInvalidResponses,
    ...remainingParams
  } = params;

  const openAiTools = tools?.map(mapLlmToolDefinitionToOpenAiToolDefinition);

  const openAiMessages: ChatCompletionMessageParam[] = [
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

  const completionPayload: ChatCompletionCreateParamsNonStreaming = {
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

  let openAiResponse: ChatCompletion;

  const timeBeforeRequest = Date.now();

  try {
    openAiResponse = await openai.chat.completions.create(completionPayload);

    /**
     * Avoid logging logprobs, as they clutter the output. The `logprobs` will
     * be persisted in the LLM Request logs instead.
     */
    const choicesWithoutLogProbs = openAiResponse.choices.map(
      ({ logprobs: _logprobs, ...choice }) => choice,
    );

    logger.debug(
      `OpenAI response: ${stringify({ ...openAiResponse, choices: choicesWithoutLogProbs })}`,
    );
  } catch (error) {
    logger.error(`OpenAI API error: ${stringify(error)}`);

    const axiosError = isAxiosError(error) ? error : undefined;

    return {
      status: "api-error",
      axiosError,
    };
  }

  const currentRequestTime = Date.now() - timeBeforeRequest;

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

  const retry = async (retryParams: {
    retryMessageContent: LlmUserMessage["content"];
  }): Promise<LlmResponse<OpenAiLlmParams>> => {
    if (retryCount > maxRetryCount) {
      return {
        status: "exceeded-maximum-retries",
        usage,
      };
    }

    logger.debug(
      `Retrying OpenAI call with the following retry message content: ${stringify(retryParams.retryMessageContent)}`,
    );

    const openAiResponseMessage = openAiResponse.choices[0]?.message;

    const responseMessages = openAiResponseMessage
      ? mapOpenAiMessagesToLlmMessages({
          messages: [openAiResponseMessage],
        })
      : undefined;

    return getOpenAiResponse({
      ...params,
      retryCount: retryCount + 1,
      messages: [
        ...params.messages,
        ...(responseMessages ?? []),
        {
          role: "user",
          content: retryParams.retryMessageContent,
        },
      ],
      previousUsage: usage,
      previousInvalidResponses: [
        ...(previousInvalidResponses ?? []),
        { ...openAiResponse, requestTime: currentRequestTime },
      ],
    });
  };

  /**
   * @todo: consider accounting for `choices` in the unified LLM response
   */
  const firstChoice = openAiResponse.choices[0];

  if (!firstChoice) {
    return retry({
      retryMessageContent: [
        {
          type: "text",
          text: "No response was provided by the model",
        },
      ],
    });
  }

  const parsedToolCalls: ParsedLlmToolCall[] = [];

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

    parsedToolCalls.push({ id, name, input: sanitizedInput });
  }

  if (retryMessageContent.length > 0) {
    return retry({ retryMessageContent });
  }

  if (
    firstChoice.finish_reason === "tool_calls" &&
    parsedToolCalls.length === 0
  ) {
    return retry({
      retryMessageContent: [
        {
          type: "text",
          text: `You indicated "tool_calls" as the finish reason, but no tool calls were made.`,
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

  const response: LlmResponse<OpenAiLlmParams> = {
    ...openAiResponse,
    status: "ok",
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

/**
 * This function sends a request to the Anthropic or OpenAI API based on the
 * `model` provided in the parameters.
 */
export const getLlmResponse = async <T extends LlmParams>(
  llmParams: T,
  usageTrackingParams: {
    /**
     * Required for tracking usage on a per-user basis.
     *
     * @todo: consider abstracting this in a wrapper method, or via
     * generic params (via a `logUsage` method).
     */
    userAccountId: AccountId;
    webId: OwnedById;
    graphApiClient: GraphApi;
    incurredInEntities: { entityId: EntityId }[];
  },
): Promise<LlmResponse<T>> => {
  const { graphApiClient, userAccountId, webId } = usageTrackingParams;

  /**
   * Check whether the user has exceeded their usage limit, before
   * proceeding with the LLM request.
   */
  const userHasExceededUsageStatus =
    await userExceededServiceUsageLimitActivity({
      graphApiClient,
      userAccountId,
    });

  if (userHasExceededUsageStatus.code !== StatusCode.Ok) {
    return {
      status: "exceeded-usage-limit",
      message:
        userHasExceededUsageStatus.message ??
        "You have exceeded your usage limit.",
    };
  }

  const aiAssistantAccountId = await getAiAssistantAccountIdActivity({
    authentication: { actorId: userAccountId },
    grantCreatePermissionForWeb: webId,
    graphApiClient,
  });

  if (!aiAssistantAccountId) {
    return {
      status: "internal-error",
      message: `Failed to retrieve AI assistant account ID ${userAccountId}`,
    };
  }

  const timeBeforeApiCall = Date.now();

  const llmResponse = (
    isLlmParamsAnthropicLlmParams(llmParams)
      ? await getAnthropicResponse(llmParams)
      : await getOpenAiResponse(llmParams)
  ) as LlmResponse<T>;

  const timeAfterApiCall = Date.now();

  const numberOfSeconds = (timeAfterApiCall - timeBeforeApiCall) / 1000;

  logger.debug(`LLM API call time: ${numberOfSeconds} seconds`);

  /**
   * Capture incurred usage in a usage record.
   */
  if (
    llmResponse.status === "ok" ||
    llmResponse.status === "exceeded-maximum-retries"
  ) {
    const { usage } = llmResponse;

    let usageRecordEntityMetadata: EntityMetadata;

    try {
      usageRecordEntityMetadata = await createUsageRecord(
        { graphApi: graphApiClient },
        { actorId: aiAssistantAccountId },
        {
          serviceName: isLlmParamsAnthropicLlmParams(llmParams)
            ? "Anthropic"
            : "OpenAI",
          featureName: llmParams.model,
          userAccountId,
          inputUnitCount: usage.inputTokens,
          outputUnitCount: usage.outputTokens,
        },
      );
    } catch (error) {
      return {
        status: "internal-error",
        message: `Failed to create usage record for AI assistant: ${stringify(error)}`,
      };
    }

    const { incurredInEntities } = usageTrackingParams;

    if (incurredInEntities.length > 0) {
      const hashInstanceAdminGroupId = await getHashInstanceAdminAccountGroupId(
        { graphApi: graphApiClient },
        { actorId: aiAssistantAccountId },
      );

      const errors = await Promise.all(
        incurredInEntities.map(async ({ entityId }) => {
          try {
            await graphApiClient.createEntity(aiAssistantAccountId, {
              draft: false,
              properties: {},
              ownedById: webId,
              entityTypeIds: [
                systemLinkEntityTypes.incurredIn.linkEntityTypeId,
              ],
              linkData: {
                leftEntityId: usageRecordEntityMetadata.recordId.entityId,
                rightEntityId: entityId,
              },
              relationships: [
                {
                  relation: "administrator",
                  subject: {
                    kind: "account",
                    subjectId: aiAssistantAccountId,
                  },
                },
                {
                  relation: "viewer",
                  subject: {
                    kind: "account",
                    subjectId: userAccountId,
                  },
                },
                {
                  relation: "viewer",
                  subject: {
                    kind: "accountGroup",
                    subjectId: hashInstanceAdminGroupId,
                  },
                },
              ],
            });

            return [];
          } catch (error) {
            return {
              status: "internal-error",
              message: `Failed to link usage record to entity with ID ${entityId}: ${stringify(error)}`,
            };
          }
        }),
      ).then((unflattenedErrors) => unflattenedErrors.flat());

      if (errors.length > 0) {
        return {
          status: "internal-error",
          message: `Failed to link usage record to entities: ${stringify(errors)}`,
        };
      }
    }
  }

  if (process.env.NODE_ENV === "development") {
    logLlmRequest({ llmParams, llmResponse });
  }

  return llmResponse;
};
