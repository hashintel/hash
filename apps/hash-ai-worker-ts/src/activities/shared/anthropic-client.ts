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

type AnthropicToolDefinition = {
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

/**
 * @todo: deprecate these types and function when the Anthropic SDK is updated
 * to account for the new `tools` parameter.
 */
export type AnthropicMessagesCreateParams = {
  tools: AnthropicToolDefinition[];
  model: AnthropicMessageModel;
} & Omit<MessageCreateParamsNonStreaming, "model">;

type ToolCallContent = {
  type: "tool_use";
  id: string;
  name: string;
  input: object;
};

export type AnthropicMessagesCreateResponse = Omit<Message, "content"> & {
  content: (Message["content"][number] & ToolCallContent)[];
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
