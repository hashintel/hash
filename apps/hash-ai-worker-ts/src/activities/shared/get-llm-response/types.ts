import type { JSONSchema } from "openai/lib/jsonschema";
import type {
  ChatCompletion as OpenAiChatCompletion,
  ChatCompletionCreateParams as OpenAiChatCompletionCreateParams,
} from "openai/resources";

import type { PermittedOpenAiModel } from "../openai";
import type {
  AnthropicMessageModel,
  AnthropicMessagesCreateParams,
  AnthropicMessagesCreateResponse,
} from "./anthropic-client";
import { isAnthropicMessageModel } from "./anthropic-client";

export type LlmToolDefinition = {
  name: string;
  description: string;
  input_schema: JSONSchema;
};

export type CommonLlmParams = {
  model: AnthropicMessageModel | PermittedOpenAiModel;
  tools?: LlmToolDefinition[];
};

export type AnthropicLlmParams = CommonLlmParams & {
  model: AnthropicMessageModel;
  max_tokens?: number;
} & Omit<AnthropicMessagesCreateParams, "tools" | "max_tokens">;

export type OpenAiLlmParams = CommonLlmParams & {
  model: PermittedOpenAiModel;
} & Omit<OpenAiChatCompletionCreateParams, "tools">;

export type LlmParams = AnthropicLlmParams | OpenAiLlmParams;

export const isLlmParamsAnthropicLlmParams = (
  params: LlmParams,
): params is AnthropicLlmParams => isAnthropicMessageModel(params.model);

export type AnthropicResponse = AnthropicMessagesCreateResponse;

export type OpenAiResponse = OpenAiChatCompletion;

export type ParsedToolCall = {
  id: string;
  name: string;
  input: object;
};

/**
 * A unified definition of the stop reason for the LLM, one of:
 * - `"stop"`: the model reached a natural stopping point (equivalent to `end_turn` in the Anthropic API, or `stop` in the OpenAI API)
 * - `"tool_use"`: the model called one or more tools (equivalent to `tool_use` in the Anthropic API, or `tool_calls` in the OpenAI API)
 * - `"length"`: the model reached the maximum token length (equivalent to `max_tokens` in the Anthropic API, or `length` in the OpenAI API)
 * - `"content_filters"`: if content was omitted due to a flag from our content filters (OpenAI specific)
 * - `"stop_sequence"`: one of your provided custom `stop_sequences` was generated (Anthropic specific)
 */
export type LlmStopReason =
  | "stop"
  | "tool_use"
  | "length"
  | "content_filter"
  | "stop_sequence";

export type LlmResponse<T extends LlmParams> = {
  stopReason: LlmStopReason;
  parsedToolCalls: ParsedToolCall[];
} & (T extends AnthropicLlmParams ? AnthropicResponse : OpenAiResponse);
