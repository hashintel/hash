import { AnthropicBedrock } from "@anthropic-ai/bedrock-sdk";
import Anthropic from "@anthropic-ai/sdk";
import type {
  Message,
  MessageCreateParamsBase,
  MessageCreateParamsNonStreaming,
  MessageParam,
  ToolUseBlock,
} from "@anthropic-ai/sdk/resources/messages";
import { getRequiredEnv } from "@local/hash-backend-utils/environment";

const anthropicApiKey = getRequiredEnv("ANTHROPIC_API_KEY");

export const anthropic = new Anthropic({
  apiKey: anthropicApiKey,
});

const anthropicMessageModels = [
  "claude-3-5-sonnet-20240620",
  "claude-3-opus-20240229",
  "claude-3-sonnet-20240229",
  "claude-3-haiku-20240307",
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
  "claude-3-haiku-20240307": 200_000,
  "claude-3-sonnet-20240229": 200_000,
  "claude-3-opus-20240229": 200_000,
  "claude-3-5-sonnet-20240620": 200_000,
};

/** @see https://docs.anthropic.com/en/docs/about-claude/models#model-comparison */
export const anthropicMessageModelToMaxOutput: Record<
  AnthropicMessageModel,
  number
> = {
  "claude-3-haiku-20240307": 4096,
  "claude-3-sonnet-20240229": 4096,
  "claude-3-opus-20240229": 4096,
  "claude-3-5-sonnet-20240620": 4096,
};

export type AnthropicMessagesCreateParams = {
  tool_choice?:
    | { type: "tool"; name: string }
    | { type: "any" }
    | { type: "auto" };
  model: AnthropicMessageModel;
  messages: MessageParam[];
} & Omit<MessageCreateParamsNonStreaming, "model" | "messages">;

type AnthropicMessagesCreateResponseContent = Message["content"][number];

export const isAnthropicContentToolUseBlock = (
  content: AnthropicMessagesCreateResponseContent,
): content is ToolUseBlock => content.type === "tool_use";

export type AnthropicMessagesCreateResponse = Omit<
  Message,
  "content" | "stop_reason"
> & {
  stop_reason: Message["stop_reason"] | "tool_use";
  content: AnthropicMessagesCreateResponseContent[];
};

const awsAccessKey = getRequiredEnv(
  "HASH_TEMPORAL_WORKER_AI_AWS_ACCESS_KEY_ID",
);
const awsSecretKey = getRequiredEnv(
  "HASH_TEMPORAL_WORKER_AI_AWS_SECRET_ACCESS_KEY",
);
/**
 * Currently this is the only region supporting Claude 3 Opus.
 */
const awsRegion = "us-west-2";

// eslint-disable-next-line @typescript-eslint/no-unsafe-call
const anthropicBedrockClient: AnthropicBedrock = new AnthropicBedrock({
  awsAccessKey,
  awsSecretKey,
  awsRegion,
});

const anthropicBedrockModels = [
  "anthropic.claude-3-sonnet-20240229-v1:0",
  "anthropic.claude-3-haiku-20240307-v1:0",
  "anthropic.claude-3-opus-20240229-v1:0",
  "anthropic.claude-3-5-sonnet-20240620-v1:0",
] as const;

type AnthropicBedrockModel = (typeof anthropicBedrockModels)[number];

/** @see https://docs.anthropic.com/en/api/claude-on-amazon-bedrock#api-model-names */
export const anthropicModelToBedrockModel: Record<
  AnthropicMessageModel,
  AnthropicBedrockModel
> = {
  "claude-3-sonnet-20240229": "anthropic.claude-3-sonnet-20240229-v1:0",
  "claude-3-haiku-20240307": "anthropic.claude-3-haiku-20240307-v1:0",
  "claude-3-opus-20240229": "anthropic.claude-3-opus-20240229-v1:0",
  "claude-3-5-sonnet-20240620": "anthropic.claude-3-5-sonnet-20240620-v1:0",
};

const anthropicApiProviders = ["anthropic", "amazon-bedrock"] as const;

export type AnthropicApiProvider = (typeof anthropicApiProviders)[number];

type AnthropicBedrockMessagesCreateParams = Parameters<
  typeof anthropicBedrockClient.messages.create
>[0];

export const createAnthropicMessagesWithTools = async (params: {
  payload: AnthropicMessagesCreateParams;
  provider: AnthropicApiProvider;
}): Promise<AnthropicMessagesCreateResponse> => {
  const { payload, provider } = params;

  let response: AnthropicMessagesCreateResponse;

  /**
   * If the model is available on Amazon Bedrock and the amazon bedrock provider
   * has been requested, use the Bedrock client for the request.
   */
  if (provider === "amazon-bedrock") {
    const bedrockModel = anthropicModelToBedrockModel[payload.model];

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    response = (await anthropicBedrockClient.messages.create(
      {
        /**
         * @todo: replace with `MessageCreateParamsNonStreaming` once the Bedrock SDK
         * has been updated to be in sync with the Anthropic SDK.
         */
        ...(payload as AnthropicBedrockMessagesCreateParams),
        model: bedrockModel,
      },
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
