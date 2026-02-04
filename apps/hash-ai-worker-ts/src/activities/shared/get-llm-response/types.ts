import type { GenerateContentResponse } from "@google-cloud/vertexai";
import type { OpenAI } from "openai";
import type { JSONSchema } from "openai/lib/jsonschema";

import type { PermittedOpenAiModel } from "../openai-client.js";
import {
  type AnthropicApiProvider,
  type AnthropicMessagesCreateParams,
  type AnthropicMessagesCreateResponse,
  isPermittedAnthropicModel,
  type PermittedAnthropicModel,
} from "./anthropic-client.js";
import {
  isPermittedGoogleAiModel,
  type PermittedGoogleAiModel,
} from "./google-vertex-ai-client.js";
import type { LlmAssistantMessage, LlmMessage } from "./llm-message.js";

/**
 * Extended JSON Schema type that supports $defs and $ref for schema references.
 * This allows defining reusable schemas within tool definitions.
 * The $defs type is permissive to accept schemas extracted from OpenAPI specs.
 */
export type LlmToolInputSchema = Omit<
  JSONSchema,
  "type" | "default" | "$defs" | "properties"
> & {
  additionalProperties: false;
  type: "object";
  /**
   * Schema definitions that can be referenced via $ref.
   * Uses `unknown` to accept schemas from various sources (e.g., OpenAPI JSON imports).
   */
  $defs?: Record<string, unknown>;
  properties?: Record<
    string,
    | JSONSchema
    | {
        $ref: string;
        description?: string;
      }
  >;
};

export type LlmToolDefinition<ToolName extends string = string> = {
  name: ToolName;
  description: string;
  inputSchema: LlmToolInputSchema;
  sanitizeInputBeforeValidation?: (rawInput: object) => object;
};

export type CommonLlmParams<ToolName extends string = string> = {
  model:
    | PermittedAnthropicModel
    | PermittedOpenAiModel
    | PermittedGoogleAiModel;
  tools?: LlmToolDefinition<ToolName>[];
  systemPrompt?: string;
  messages: LlmMessage[];
  toolChoice?: ToolName | "required";
  retryContext?: {
    retryCount: number;
    previousSuccessfulToolCalls: ParsedLlmToolCall<ToolName>[];
    previousUsage: LlmUsage;
  };
};

export type GoogleAiParams<ToolName extends string = string> =
  CommonLlmParams<ToolName> & {
    model: PermittedGoogleAiModel;
    previousInvalidResponses?: (GenerateContentResponse & {
      requestTime: number;
    })[];
  };

export type AnthropicLlmParams<ToolName extends string = string> =
  CommonLlmParams<ToolName> & {
    model: PermittedAnthropicModel;
    maxTokens?: number;
    previousInvalidResponses?: (AnthropicMessagesCreateResponse & {
      requestTime: number;
    })[];
  } & Omit<
      AnthropicMessagesCreateParams,
      "tools" | "max_tokens" | "system" | "messages" | "tool_choice"
    >;

export type OpenAiLlmParams<ToolName extends string = string> =
  CommonLlmParams<ToolName> & {
    model: PermittedOpenAiModel;
    trimMessageAtIndex?: number;
    previousInvalidResponses?: (OpenAI.ChatCompletion & {
      requestTime: number;
    })[];
  } & Omit<
      OpenAI.ChatCompletionCreateParams,
      "tools" | "messages" | "tool_choice"
    >;

export type LlmParams<ToolName extends string = string> =
  | AnthropicLlmParams<ToolName>
  | OpenAiLlmParams<ToolName>
  | GoogleAiParams<ToolName>;

export type LlmRequestMetadata = {
  requestId: string;
  stepId?: string;
  taskName?: string;
};

export type LlmProvider = AnthropicApiProvider | "openai" | "google-vertex-ai";

export type LlmLog = LlmRequestMetadata & {
  finalized: boolean;
  provider: LlmProvider;
  request: LlmParams;
  response: LlmResponse<LlmParams>;
  secondsTaken: number;
};

export type LlmServerErrorLog = LlmRequestMetadata & {
  provider: LlmProvider;
  response: unknown;
  request:
    | LlmParams
    | AnthropicMessagesCreateParams
    | OpenAI.ChatCompletionCreateParamsNonStreaming;
  secondsTaken: number;
};

export const isLlmParamsAnthropicLlmParams = (
  params: LlmParams,
): params is AnthropicLlmParams => isPermittedAnthropicModel(params.model);

export const isLlmParamsGoogleAiParams = (
  params: LlmParams,
): params is GoogleAiParams => isPermittedGoogleAiModel(params.model);

export type AnthropicResponse = Omit<
  AnthropicMessagesCreateResponse,
  "content" | "role" | "usage"
> & {
  invalidResponses: (AnthropicMessagesCreateResponse & {
    requestTime: number;
  })[];
};

export type OpenAiResponse = Omit<
  OpenAI.ChatCompletion,
  "usage" | "choices" | "object"
> & {
  invalidResponses: (OpenAI.ChatCompletion & { requestTime: number })[];
};

export type GoogleAiResponse = Omit<
  GenerateContentResponse,
  "usage" | "candidates"
> & {
  invalidResponses: (GenerateContentResponse & { requestTime: number })[];
};

export type ParsedLlmToolCall<
  ToolName extends string = string,
  Input extends object = object,
> = {
  id: string;
  name: ToolName;
  input: Input;
};

/**
 * A unified definition of the stop reason for the LLM, one of:
 * - `"stop"`: the model reached a natural stopping point (equivalent to `end_turn` in the Anthropic API, or `stop` in
 * the OpenAI API)
 * - `"tool_use"`: the model called one or more tools (equivalent to `tool_use` in the Anthropic API, or `tool_calls`
 * in the OpenAI API)
 * - `"length"`: the model reached the maximum token length (equivalent to `max_tokens` in the Anthropic API, or
 * `length` in the OpenAI API)
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

export type LlmErrorResponse =
  | {
      status: "exceeded-maximum-retries";
      provider: LlmProvider;
      lastRequestTime: number;
      totalRequestTime: number;
      invalidResponses:
        | AnthropicResponse["invalidResponses"]
        | OpenAiResponse["invalidResponses"];
      usage: LlmUsage;
    }
  | {
      status: "api-error";
      provider: LlmProvider;
      message: string;
      error?: unknown;
    }
  | {
      status: "aborted";
      provider: LlmProvider;
    }
  | {
      status: "max-tokens";
      provider: LlmProvider;
      lastRequestTime: number;
      totalRequestTime: number;
      requestMaxTokens?: number;
      response: AnthropicMessagesCreateResponse | OpenAI.ChatCompletion;
      usage: LlmUsage;
    }
  | {
      status: "exceeded-usage-limit";
      provider: LlmProvider;
      message: string;
    }
  | {
      status: "internal-error";
      provider: LlmProvider;
      message: string;
    };

export type LlmResponse<T extends LlmParams> =
  | ({
      status: "ok";
      stopReason: LlmStopReason;
      provider: LlmProvider;
      usage: LlmUsage;
      lastRequestTime: number;
      totalRequestTime: number;
      message: LlmAssistantMessage<
        T["tools"] extends (infer U)[]
          ? U extends { name: infer N }
            ? N
            : never
          : string
      >;
    } & (T extends AnthropicLlmParams
      ? Omit<AnthropicResponse, "stop_reason">
      : T extends GoogleAiParams
        ? GoogleAiResponse
        : OpenAiResponse))
  | LlmErrorResponse;
