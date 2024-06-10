import AnthropicBedrock from "@anthropic-ai/bedrock-sdk";
import Anthropic from "@anthropic-ai/sdk";
import type { MessageCreateParamsNonStreaming } from "@anthropic-ai/sdk/resources";
import type {
  ImageBlockParam,
  Message,
  MessageCreateParamsBase,
  MessageParam,
  TextBlockParam,
} from "@anthropic-ai/sdk/resources/messages";
import { getRequiredEnv } from "@local/hash-backend-utils/environment";
import type { JSONSchema } from "openai/lib/jsonschema";

const anthropicApiKey = getRequiredEnv("ANTHROPIC_API_KEY");

export const anthropic = new Anthropic({
  apiKey: anthropicApiKey,
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

/** @see https://docs.anthropic.com/claude/docs/models-overview#model-comparison */
export const anthropicMessageModelToMaxOutput: Record<
  AnthropicMessageModel,
  number
> = {
  "claude-instant-1.2": 4096,
  "claude-2.0": 4096,
  "claude-2.1": 4096,
  "claude-3-haiku-20240307": 4096,
  "claude-3-sonnet-20240229": 4096,
  "claude-3-opus-20240229": 4096,
};

/**
 * @todo: deprecate these types and function when the Anthropic SDK is updated
 * to account for the new `tools` parameter.
 */
type ToolUseContent = {
  type: "tool_use";
  id: string;
  name: string;
  input: object;
};

type ToolResultContent = {
  type: "tool_result";
  tool_use_id: string;
  content: string;
  is_error?: true;
};

export type MessageContent =
  | (TextBlockParam | ImageBlockParam | ToolUseContent | ToolResultContent)[]
  | string;

export type AnthropicMessage = Omit<MessageParam, "content"> & {
  content: MessageContent;
};

export type AnthropicMessagesCreateParams = {
  tools?: AnthropicToolDefinition[];
  tool_choice?:
    | { type: "tool"; name: string }
    | { type: "any" }
    | { type: "auto" };
  model: AnthropicMessageModel;
  messages: AnthropicMessage[];
} & Omit<MessageCreateParamsNonStreaming, "model" | "messages">;

type AnthropicMessagesCreateResponseContent =
  | Message["content"][number]
  | ToolUseContent;

export const isAnthropicContentToolUseContent = (
  content: AnthropicMessagesCreateResponseContent,
): content is ToolUseContent => content.type === "tool_use";

export type AnthropicMessagesCreateResponse = Omit<
  Message,
  "content" | "stop_reason"
> & {
  stop_reason: Message["stop_reason"] | "tool_use";
  content: AnthropicMessagesCreateResponseContent[];
};

const awsAccessKey = getRequiredEnv("HASH_TEMPORAL_AWS_ACCESS_KEY_ID");
const awsSecretKey = getRequiredEnv("HASH_TEMPORAL_AWS_SECRET_ACCESS_KEY");
const awsRegion = "us-west-2";

const anthropicBedrockClient = new AnthropicBedrock({
  awsAccessKey,
  awsSecretKey,
  awsRegion,
});

const anthropicBedrockModels = [
  "anthropic.claude-3-haiku-20240307-v1:0",
  "anthropic.claude-3-haiku-20240307-v1:0",
  "anthropic.claude-3-opus-20240229-v1:0",
] as const;

type AnthropicBedrockModel = (typeof anthropicBedrockModels)[number];

/** @see https://docs.anthropic.com/en/api/claude-on-amazon-bedrock#api-model-names */
export const anthropicModelToBedrockModel: Record<
  AnthropicMessageModel,
  AnthropicBedrockModel | null
> = {
  "claude-3-sonnet-20240229": "anthropic.claude-3-haiku-20240307-v1:0",
  "claude-3-haiku-20240307": "anthropic.claude-3-haiku-20240307-v1:0",
  "claude-3-opus-20240229": "anthropic.claude-3-opus-20240229-v1:0",
  "claude-2.0": null,
  "claude-2.1": null,
  "claude-instant-1.2": null,
};

type AnthropicBedrockMessagesCreateParams = Omit<
  AnthropicMessagesCreateParams,
  "model"
> & {
  model: AnthropicBedrockModel;
};

export const createAnthropicMessagesWithTools = async (
  params:
    | {
        payload: AnthropicMessagesCreateParams;
        provider: "anthropic";
      }
    | {
        payload: AnthropicBedrockMessagesCreateParams;
        provider: "amazon-bedrock";
      },
): Promise<AnthropicMessagesCreateResponse> => {
  const { payload, provider } = params;

  let response: AnthropicMessagesCreateResponse;

  /**
   * If the model is available on Amazon Bedrock and the amazon bedrock provider
   * has been requested, use the Bedrock client for the request.
   */
  if (provider === "amazon-bedrock") {
    response = (await anthropicBedrockClient.messages.create(
      payload as MessageCreateParamsNonStreaming,
      {
        headers: {
          "anthropic-beta": "tools-2024-05-16",
        },
      },
    )) as AnthropicMessagesCreateResponse;
  } else {
    response = (await anthropic.messages.create(
      payload as MessageCreateParamsNonStreaming,
      {
        headers: {
          "anthropic-beta": "tools-2024-05-16",
        },
      },
    )) as AnthropicMessagesCreateResponse;
  }

  return response;
};
