import { AnthropicBedrock } from "@anthropic-ai/bedrock-sdk";
import Anthropic from "@anthropic-ai/sdk";
import type {
  Message,
  MessageCreateParamsBase,
  MessageCreateParamsNonStreaming,
  ToolUseBlock,
} from "@anthropic-ai/sdk/resources/messages";
import { getRequiredEnv } from "@local/hash-backend-utils/environment";
import { Context } from "@temporalio/activity";

const anthropicApiKey = getRequiredEnv("ANTHROPIC_API_KEY");

export const anthropic = new Anthropic({
  apiKey: anthropicApiKey,
});

const permittedAnthropicModels = [
  "claude-3-5-sonnet-20240620",
  "claude-3-opus-20240229",
  "claude-3-haiku-20240307",
  "claude-opus-4-5",
] satisfies MessageCreateParamsBase["model"][];

export type PermittedAnthropicModel = (typeof permittedAnthropicModels)[number];

export const isPermittedAnthropicModel = (
  model: string,
): model is PermittedAnthropicModel =>
  permittedAnthropicModels.includes(model as PermittedAnthropicModel);

/** @see https://docs.anthropic.com/claude/docs/models-overview#model-comparison */
export const anthropicMessageModelToContextWindow: Record<
  PermittedAnthropicModel,
  number
> = {
  "claude-3-haiku-20240307": 200_000,
  "claude-3-opus-20240229": 200_000,
  "claude-3-5-sonnet-20240620": 200_000,
  "claude-opus-4-5": 200_000,
};

/** @see https://docs.anthropic.com/en/docs/about-claude/models#model-comparison */
export const anthropicMessageModelToMaxOutput: Record<
  PermittedAnthropicModel,
  number
> = {
  "claude-3-haiku-20240307": 4096,
  "claude-3-opus-20240229": 4096,
  "claude-3-5-sonnet-20240620": 8192,
  "claude-opus-4-5": 64_000,
};

export type AnthropicMessagesCreateParams = {
  model: PermittedAnthropicModel;
} & Omit<MessageCreateParamsNonStreaming, "model">;

type AnthropicMessagesCreateResponseContent = Message["content"][number];

export const isAnthropicContentToolUseBlock = (
  content: AnthropicMessagesCreateResponseContent,
): content is ToolUseBlock => content.type === "tool_use";

export type AnthropicMessagesCreateResponse = Message & {
  provider: AnthropicApiProvider;
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

const anthropicBedrockClient: AnthropicBedrock = new AnthropicBedrock({
  awsAccessKey,
  awsSecretKey,
  awsRegion,
});

type AnthropicBedrockModel =
  | "anthropic.claude-3-haiku-20240307-v1:0"
  | "anthropic.claude-3-opus-20240229-v1:0"
  | "anthropic.claude-3-5-sonnet-20240620-v1:0";

/** @see https://docs.anthropic.com/en/api/claude-on-amazon-bedrock#api-model-names */
export const anthropicModelToBedrockModel: Record<
  PermittedAnthropicModel,
  AnthropicBedrockModel
> = {
  "claude-3-haiku-20240307": "anthropic.claude-3-haiku-20240307-v1:0",
  "claude-3-opus-20240229": "anthropic.claude-3-opus-20240229-v1:0",
  "claude-3-5-sonnet-20240620": "anthropic.claude-3-5-sonnet-20240620-v1:0",
};

export type AnthropicApiProvider = "anthropic" | "amazon-bedrock";

export const createAnthropicMessagesWithTools = async (params: {
  payload: AnthropicMessagesCreateParams;
  provider: AnthropicApiProvider;
}): Promise<AnthropicMessagesCreateResponse> => {
  const { payload, provider } = params;

  let response: Message & { _request_id?: string | null | undefined };

  /**
   * If the model is available on Amazon Bedrock and the amazon bedrock provider
   * has been requested, use the Bedrock client for the request.
   */
  if (provider === "amazon-bedrock") {
    const bedrockModel = anthropicModelToBedrockModel[payload.model];
    response = await anthropicBedrockClient.messages.create(
      {
        ...payload,
        model: bedrockModel,
      },
      {
        signal: Context.current().cancellationSignal,
        headers: {
          "anthropic-beta": "max-tokens-3-5-sonnet-2024-07-15",
        },
      },
    );
  } else {
    response = await anthropic.messages.create(payload, {
      signal: Context.current().cancellationSignal,
      headers: {
        "anthropic-beta": "max-tokens-3-5-sonnet-2024-07-15",
      },
    });
  }

  return { ...response, provider };
};
