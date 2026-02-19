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
  "claude-sonnet-4-6",
  "claude-opus-4-6",
  "claude-haiku-4-5-20251001",
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
  "claude-haiku-4-5-20251001": 200_000,
  "claude-opus-4-6": 200_000,
  "claude-sonnet-4-6": 200_000,
};

/** @see https://docs.anthropic.com/en/docs/about-claude/models#model-comparison */
export const anthropicMessageModelToMaxOutput: Record<
  PermittedAnthropicModel,
  number
> = {
  "claude-haiku-4-5-20251001": 4096,
  // actually 128k, but this forces streaming mode.
  "claude-opus-4-6": 24_000,
  "claude-sonnet-4-6": 8192,
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
  | "anthropic.claude-haiku-4-5-20251001-v1:0"
  | "anthropic.claude-opus-4-6-v1"
  | "anthropic.claude-sonnet-4-6";

/** @see https://docs.anthropic.com/en/api/claude-on-amazon-bedrock#api-model-names */
export const anthropicModelToBedrockModel: Record<
  PermittedAnthropicModel,
  AnthropicBedrockModel
> = {
  "claude-haiku-4-5-20251001": "anthropic.claude-haiku-4-5-20251001-v1:0",
  "claude-opus-4-6": "anthropic.claude-opus-4-6-v1",
  "claude-sonnet-4-6": "anthropic.claude-sonnet-4-6",
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
