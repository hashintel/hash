import type { JSONSchema } from "openai/lib/jsonschema";
import type {
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
import type { LlmAssistantMessage, LlmMessage } from "./llm-message";

export type LlmToolDefinition<ToolName extends string = string> = {
  name: ToolName;
  description: string;
  inputSchema: JSONSchema;
  sanitizeInputBeforeValidation?: (rawInput: object) => object;
};

export type CommonLlmParams<ToolName extends string = string> = {
  model: AnthropicMessageModel | PermittedOpenAiModel;
  tools?: LlmToolDefinition<ToolName>[];
  retryCount?: number;
  systemMessageContent?: string;
  messages: LlmMessage[];
};

export type AnthropicLlmParams<ToolName extends string = string> =
  CommonLlmParams<ToolName> & {
    model: AnthropicMessageModel;
    maxTokens?: number;
  } & Omit<
      AnthropicMessagesCreateParams,
      "tools" | "max_tokens" | "system" | "messages"
    >;

export type OpenAiLlmParams<ToolName extends string = string> =
  CommonLlmParams<ToolName> & {
    model: PermittedOpenAiModel;
    trimMessageAtIndex?: number;
  } & Omit<OpenAiChatCompletionCreateParams, "tools" | "messages">;

export type LlmParams<ToolName extends string = string> =
  | AnthropicLlmParams<ToolName>
  | OpenAiLlmParams<ToolName>;

export const isLlmParamsAnthropicLlmParams = (
  params: LlmParams,
): params is AnthropicLlmParams => isAnthropicMessageModel(params.model);

export type AnthropicResponse = Omit<
  AnthropicMessagesCreateResponse,
  "content" | "role" | "usage"
>;

export type OpenAiResponse = Omit<OpenAiChatCompletion, "usage" | "choices">;

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

export type LlmUsage = {
  /**
   * The number of input tokens which were used.
   * Equivalent to `prompt_tokens` in the OpenAI API, or `input_tokens` in the Anthropic API.
   */
  inputTokens: number;
  /**
   * The number of output tokens which were used.
   * Equivalent to `completion_tokens` in the OpenAI API, or `output_tokens` in the Anthropic API.
   */
  outputTokens: number;
  /**
   * Total number of tokens used in the request (input + output tokens)
   */
  totalTokens: number;
};

export type LlmResponse<T extends LlmParams> =
  | ({
      status: "ok";
      stopReason: LlmStopReason;
      usage: LlmUsage;
      message: LlmAssistantMessage<
        T["tools"] extends (infer U)[]
          ? U extends { name: infer N }
            ? N
            : never
          : string
      >;
    } & (T extends AnthropicLlmParams ? AnthropicResponse : OpenAiResponse))
  | {
      status: "exceeded-maximum-retries";
    }
  | {
      status: "api-error";
    };
