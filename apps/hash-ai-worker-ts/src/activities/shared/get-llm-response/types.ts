import type { JSONSchema } from "openai/lib/jsonschema";
import type {
  ChatCompletion,
  ChatCompletion as OpenAiChatCompletion,
  ChatCompletionCreateParams as OpenAiChatCompletionCreateParams,
} from "openai/resources";

import type { PermittedOpenAiModel } from "../openai-client";
import type {
  AnthropicMessageModel,
  AnthropicMessagesCreateParams,
  AnthropicMessagesCreateResponse,
} from "./anthropic-client";
import { isAnthropicMessageModel } from "./anthropic-client";

export type LlmToolDefinition<ToolName extends string = string> = {
  name: ToolName;
  description: string;
  inputSchema: JSONSchema;
};

export type CommonLlmParams<ToolName extends string = string> = {
  model: AnthropicMessageModel | PermittedOpenAiModel;
  tools?: LlmToolDefinition<ToolName>[];
  retryCount?: number;
};

export type AnthropicLlmParams<ToolName extends string = string> =
  CommonLlmParams<ToolName> & {
    model: AnthropicMessageModel;
    maxTokens?: number;
  } & Omit<AnthropicMessagesCreateParams, "tools" | "max_tokens">;

export type OpenAiLlmParams<ToolName extends string = string> =
  CommonLlmParams<ToolName> & {
    model: PermittedOpenAiModel;
    trimMessageAtIndex?: number;
  } & Omit<OpenAiChatCompletionCreateParams, "tools">;

export type LlmParams<ToolName extends string = string> =
  | AnthropicLlmParams<ToolName>
  | OpenAiLlmParams<ToolName>;

export const isLlmParamsAnthropicLlmParams = (
  params: LlmParams,
): params is AnthropicLlmParams => isAnthropicMessageModel(params.model);

export type AnthropicResponse = AnthropicMessagesCreateResponse;

export type OpenAiResponse = Omit<OpenAiChatCompletion, "usage" | "choices"> & {
  usage: NonNullable<OpenAiChatCompletion["usage"]>;
  choices: [ChatCompletion.Choice, ...ChatCompletion.Choice[]];
};

export type ParsedLlmToolCall<ToolName extends string = string> = {
  id: string;
  name: ToolName;
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

export type LlmResponse<T extends LlmParams> =
  | ({
      status: "ok";
      stopReason: LlmStopReason;
      parsedToolCalls: ParsedLlmToolCall<
        NonNullable<T["tools"]>[number]["name"]
      >[];
    } & (T extends AnthropicLlmParams ? AnthropicResponse : OpenAiResponse))
  | {
      status: "exceeded-maximum-retries";
    }
  | {
      status: "api-error";
    };
