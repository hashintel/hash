import type OpenAI from "openai";
import type { JSONSchema } from "openai/lib/jsonschema";
import type { ChatCompletion, FunctionParameters } from "openai/resources";

import type {
  AnthropicMessageModel,
  AnthropicMessagesCreateParams,
  AnthropicMessagesCreateResponse,
  AnthropicToolDefinition,
} from "./anthropic-client";
import {
  createAnthropicMessagesWithTools,
  isAnthropicContentToolCallContent,
  isAnthropicMessageModel,
} from "./anthropic-client";
import type { PermittedOpenAiModel } from "./openai";
import { openai } from "./openai-client";

type LlmToolDefinition = {
  name: string;
  description: string;
  input_schema: JSONSchema;
};

const mapLlmToolDefinitionToAnthropicToolDefinition = (
  tool: LlmToolDefinition,
): AnthropicToolDefinition => ({
  name: tool.name,
  description: tool.description,
  input_schema: tool.input_schema,
});

const mapLlmToolDefinitionToOpenAiToolDefinition = (
  tool: LlmToolDefinition,
): OpenAI.Chat.Completions.ChatCompletionTool => ({
  type: "function",
  function: {
    name: tool.name,
    parameters: tool.input_schema as FunctionParameters,
    description: tool.description,
  },
});

type CommonLlmParams = {
  model: AnthropicMessageModel | PermittedOpenAiModel;
  tools?: LlmToolDefinition[];
};

type AnthropicLlmParams = CommonLlmParams & {
  model: AnthropicMessageModel;
} & Omit<AnthropicMessagesCreateParams, "tools">;

type OpenAiLlmParams = CommonLlmParams & {
  model: PermittedOpenAiModel;
} & Omit<OpenAI.ChatCompletionCreateParams, "tools">;

type LlmParams = AnthropicLlmParams | OpenAiLlmParams;

const isLlmParamsAnthropicLlmParams = (
  params: LlmParams,
): params is AnthropicLlmParams => isAnthropicMessageModel(params.model);

type AnthropicResponse = AnthropicMessagesCreateResponse;

type OpenAiResponse = ChatCompletion;

type ParsedToolCall = {
  id: string;
  name: string;
  input: object;
};

const parseToolCallsFromAnthropicResponse = (
  response: AnthropicResponse,
): ParsedToolCall[] =>
  response.content
    .filter(isAnthropicContentToolCallContent)
    .map(({ id, name, input }) => ({ id, name, input }));

const parseToolCallsFromOpenAiResponse = (
  response: OpenAiResponse,
): ParsedToolCall[] =>
  response.choices[0]?.message.tool_calls?.map(
    ({ id, function: { name, arguments: functionArguments } }) => {
      const input = JSON.parse(functionArguments) as object;

      return { id, name, input };
    },
  ) ?? [];

/**
 * A unified definition of the stop reason for the LLM, one of:
 * - `"stop"`: the model reached a natural stopping point (equivalent to `end_turn` in the Anthropic API, or `stop` in the OpenAI API)
 * - `"tool_use"`: the model called one or more tools (equivalent to `tool_use` in the Anthropic API, or `tool_calls` in the OpenAI API)
 * - `"length"`: the model reached the maximum token length (equivalent to `max_tokens` in the Anthropic API, or `length` in the OpenAI API)
 * - `"content_filters"`: if content was omitted due to a flag from our content filters (OpenAI specific)
 * - `"stop_sequence"`: one of your provided custom `stop_sequences` was generated (Anthropic specific)
 */
type LlmStopReason =
  | "stop"
  | "tool_use"
  | "length"
  | "content_filter"
  | "stop_sequence";

const mapOpenAiFinishReasonToLlmStopReason = (
  finishReason: ChatCompletion["choices"][0]["finish_reason"],
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
      throw new Error(`Unexpected OpenAi finish reason: ${finishReason}`);
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

type LlmResponse<T extends LlmParams> = {
  stopReason: LlmStopReason;
  parsedToolCalls: ParsedToolCall[];
} & (T extends AnthropicLlmParams ? AnthropicResponse : OpenAiResponse);

/**
 * This function sends a request to the Anthropic or OpenAI API based on the
 * `model` provided in the parameters.
 */
export const getLlmResponse = async <T extends LlmParams>(
  params: T,
): Promise<LlmResponse<T>> => {
  if (isLlmParamsAnthropicLlmParams(params)) {
    const anthropicTools = params.tools?.map(
      mapLlmToolDefinitionToAnthropicToolDefinition,
    );

    const anthropicResponse = await createAnthropicMessagesWithTools({
      ...params,
      tools: anthropicTools,
    });

    const parsedToolCalls =
      parseToolCallsFromAnthropicResponse(anthropicResponse);

    const stopReason = mapAnthropicStopReasonToLlmStopReason(
      anthropicResponse.stop_reason,
    );

    const response: LlmResponse<AnthropicLlmParams> = {
      parsedToolCalls,
      stopReason,
      ...anthropicResponse,
    };

    return response as unknown as LlmResponse<T>;
  } else {
    const openAiTools = params.tools?.map(
      mapLlmToolDefinitionToOpenAiToolDefinition,
    );

    const openAiResponse = await openai.chat.completions.create({
      ...params,
      tools: openAiTools,
      stream: false,
    });

    const parsedToolCalls = parseToolCallsFromOpenAiResponse(openAiResponse);

    /**
     * @todo: consider accounting for `choices` in the unified LLM response
     */
    const stopReason = mapOpenAiFinishReasonToLlmStopReason(
      openAiResponse.choices[0]!.finish_reason,
    );

    const response: LlmResponse<OpenAiLlmParams> = {
      stopReason,
      parsedToolCalls,
      ...openAiResponse,
    };

    return response as unknown as LlmResponse<T>;
  }
};
