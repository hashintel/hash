import Anthropic from "@anthropic-ai/sdk";
import type { MessageCreateParamsNonStreaming } from "@anthropic-ai/sdk/resources";
import type {
  Message,
  MessageCreateParamsBase,
} from "@anthropic-ai/sdk/resources/messages";
import type { JSONSchema } from "openai/lib/jsonschema";

if (!process.env.ANTHROPIC_API_KEY) {
  throw new Error("ANTHROPIC_API_KEY environment variable not set.");
}

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export type AnthropicToolDefinition = {
  name: string;
  description: string;
  input_schema: JSONSchema;
};

const anthropicMessageModels = [
  "claude-3-opus-20240229",
  "claude-3-sonnet-20240229",
  "claude-3-haiku-20240307",
  "claude-2.1",
  "claude-2.0",
  "claude-instant-1.2",
] satisfies MessageCreateParamsBase["model"][];

export type AnthropicMessageModel = (typeof anthropicMessageModels)[number];

export const isAnthropicMessageModel = (
  model: string,
): model is AnthropicMessageModel =>
  anthropicMessageModels.includes(model as AnthropicMessageModel);

/** @see https://docs.anthropic.com/claude/docs/models-overview#model-comparison */
export const anthropicMessageModelToContextWindow: Record<
  AnthropicMessageModel,
  number
> = {
  "claude-instant-1.2": 100_000,
  "claude-2.0": 100_000,
  "claude-2.1": 200_000,
  "claude-3-haiku-20240307": 200_000,
  "claude-3-sonnet-20240229": 200_000,
  "claude-3-opus-20240229": 200_000,
};

/**
 * @todo: deprecate these types and function when the Anthropic SDK is updated
 * to account for the new `tools` parameter.
 */
export type AnthropicMessagesCreateParams = {
  tools?: AnthropicToolDefinition[];
  model: AnthropicMessageModel;
} & Omit<MessageCreateParamsNonStreaming, "model">;

type ToolCallContent = {
  type: "tool_use";
  id: string;
  name: string;
  input: object;
};

type AnthropicMessagesCreateResponseContent =
  | Message["content"][number]
  | ToolCallContent;

export const isAnthropicContentToolCallContent = (
  content: AnthropicMessagesCreateResponseContent,
): content is ToolCallContent => content.type === "tool_use";

export type AnthropicMessagesCreateResponse = Omit<
  Message,
  "content" | "stop_reason"
> & {
  stop_reason: Message["stop_reason"] | "tool_use";
  content: AnthropicMessagesCreateResponseContent[];
};

export const createAnthropicMessagesWithTools = async (
  params: AnthropicMessagesCreateParams,
): Promise<AnthropicMessagesCreateResponse> => {
  const response = await anthropic.messages.create(params, {
    headers: {
      "anthropic-beta": "tools-2024-04-04",
    },
  });

  return response as AnthropicMessagesCreateResponse;
};
