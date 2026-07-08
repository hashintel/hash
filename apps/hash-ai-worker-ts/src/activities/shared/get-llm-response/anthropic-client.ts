import { AnthropicBedrock } from "@anthropic-ai/bedrock-sdk";
import Anthropic from "@anthropic-ai/sdk";
import { Context } from "@temporalio/activity";

import { getRequiredEnv } from "@local/hash-backend-utils/environment";

import type {
  Message,
  MessageCreateParamsBase,
  MessageCreateParamsNonStreaming,
  ToolUseBlock,
} from "@anthropic-ai/sdk/resources/messages";

const anthropicApiKey = getRequiredEnv("ANTHROPIC_API_KEY");

export const anthropic = new Anthropic({
  apiKey: anthropicApiKey,
});

const permittedAnthropicModels = [
  "claude-sonnet-4-6",
  "claude-opus-4-6",
  "claude-opus-4-8",
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
  "claude-opus-4-8": 200_000,
  "claude-sonnet-4-6": 200_000,
};

/** @see https://docs.anthropic.com/en/docs/about-claude/models#model-comparison */
export const anthropicMessageModelToMaxOutput: Record<
  PermittedAnthropicModel,
  number
> = {
  // actually 64k, but we should implement streaming mode to handle higher.
  "claude-haiku-4-5-20251001": 12_000,
  // actually 128k, but we should implement streaming mode to handle higher.
  "claude-opus-4-6": 12_000,
  // actually 128k, but we should implement streaming mode to handle higher.
  "claude-opus-4-8": 12_000,
  // actually 64k, but we should implement streaming mode to handle higher.
  "claude-sonnet-4-6": 12_000,
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
  | "anthropic.claude-opus-4-8-v1"
  | "anthropic.claude-sonnet-4-6";

/** @see https://docs.anthropic.com/en/api/claude-on-amazon-bedrock#api-model-names */
export const anthropicModelToBedrockModel: Record<
  PermittedAnthropicModel,
  AnthropicBedrockModel
> = {
  "claude-haiku-4-5-20251001": "anthropic.claude-haiku-4-5-20251001-v1:0",
  "claude-opus-4-6": "anthropic.claude-opus-4-6-v1",
  "claude-opus-4-8": "anthropic.claude-opus-4-8-v1",
  "claude-sonnet-4-6": "anthropic.claude-sonnet-4-6",
};

export type AnthropicApiProvider = "anthropic" | "amazon-bedrock";

/**
 * Claude Opus 4.8 rejects non-default sampling parameters (`temperature`,
 * `top_p`, `top_k`) with a 400 error, and replaces manual thinking budgets
 * with adaptive thinking controlled by an `effort` parameter.
 *
 * @see https://platform.claude.com/docs/en/about-claude/models/whats-new-claude-4-8
 */
const normalizePayloadForModel = (
  payload: AnthropicMessagesCreateParams,
): AnthropicMessagesCreateParams => {
  if (payload.model !== "claude-opus-4-8") {
    return payload;
  }

  const {
    temperature: _temperature,
    top_p: _topP,
    top_k: _topK,
    ...rest
  } = payload;

  /**
   * Thinking is incompatible with forced tool use (`tool_choice` of `any` or
   * `tool`), so only enable adaptive thinking when the model is free to choose.
   */
  const toolChoiceForcesToolUse =
    rest.tool_choice?.type === "any" || rest.tool_choice?.type === "tool";

  return {
    ...rest,
    ...(toolChoiceForcesToolUse
      ? {}
      : {
          thinking: rest.thinking ?? { type: "adaptive" },
          output_config: rest.output_config ?? { effort: "medium" },
        }),
  };
};

export const createAnthropicMessagesWithTools = async (params: {
  payload: AnthropicMessagesCreateParams;
  provider: AnthropicApiProvider;
}): Promise<AnthropicMessagesCreateResponse> => {
  const { provider } = params;
  const payload = normalizePayloadForModel(params.payload);

  let response: Message;

  /**
   * If the model is available on Amazon Bedrock and the amazon bedrock provider
   * has been requested, use the Bedrock client for the request.
   */
  /** @todo re-enable switching to bedrock */
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (false) {
    const bedrockModel = anthropicModelToBedrockModel[payload.model];
    const stream = anthropicBedrockClient.messages.stream(
      {
        ...payload,
        model: bedrockModel,
      },
      {
        signal: Context.current().cancellationSignal,
      },
    );
    response = await stream.finalMessage();
  } else {
    const stream = anthropic.messages.stream(payload, {
      signal: Context.current().cancellationSignal,
    });
    response = await stream.finalMessage();
  }

  return { ...response, provider };
};
