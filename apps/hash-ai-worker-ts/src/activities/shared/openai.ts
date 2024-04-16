import type { InferenceModelName } from "@local/hash-isomorphic-utils/ai-inference-types";
import type { Status } from "@local/status";
import { StatusCode } from "@local/status";
import { Context } from "@temporalio/activity";
import type OpenAI from "openai";
import { promptTokensEstimate } from "openai-chat-tokens";

import { logger } from "../../shared/logger";
import { openai } from "./openai-client";
import { stringify } from "./stringify";

export type PermittedOpenAiModel =
  | "gpt-3.5-turbo-1106"
  | "gpt-4-1106-preview"
  | "gpt-4-0125-preview"
  | "gpt-4-turbo"
  | "gpt-4";

const modelToContextWindow: Record<PermittedOpenAiModel, number> = {
  "gpt-3.5-turbo-1106": 16_385,
  "gpt-4-1106-preview": 128_000,
  "gpt-4-0125-preview": 128_000,
  "gpt-4-turbo": 128_000,
  "gpt-4": 8_192,
};

const isPermittedModel = (
  model: OpenAI.ChatCompletionCreateParams["model"],
): model is PermittedOpenAiModel =>
  Object.keys(modelToContextWindow).includes(model);

export const getOpenAiResponse = async (
  openAiPayload: OpenAI.ChatCompletionCreateParams,
  trimMessageAtIndex?: number,
): Promise<
  Status<{
    response: OpenAI.Chat.Completions.ChatCompletion.Choice;
    usage: OpenAI.Completions.CompletionUsage;
  }>
> => {
  if (!isPermittedModel(openAiPayload.model)) {
    return {
      code: StatusCode.Internal,
      contents: [],
      message: `Invalid model: ${openAiPayload.model}`,
    };
  }

  const modelContextWindow = modelToContextWindow[openAiPayload.model];
  const completionPayloadOverhead = 4_096;

  const newCompletionPayload = { ...openAiPayload };

  let estimatedPromptTokens: number | undefined;
  if (typeof trimMessageAtIndex === "number") {
    let excessTokens: number;
    do {
      estimatedPromptTokens = promptTokensEstimate({
        messages: openAiPayload.messages,
        functions: openAiPayload.tools?.map((tool) => tool.function),
      });
      logger.info(`Estimated prompt tokens: ${estimatedPromptTokens}`);

      excessTokens =
        estimatedPromptTokens + completionPayloadOverhead - modelContextWindow;

      if (excessTokens < 10) {
        break;
      }

      logger.info(
        `Estimated prompt tokens (${estimatedPromptTokens}) + completion token overhead (${completionPayloadOverhead}) exceeds model context window (${modelContextWindow}), trimming original user text input by ${
          excessTokens / 4
        } characters.`,
      );

      const firstUserMessageContent =
        newCompletionPayload.messages[trimMessageAtIndex]!.content;

      newCompletionPayload.messages[trimMessageAtIndex]!.content =
        firstUserMessageContent?.slice(
          0,
          firstUserMessageContent.length - excessTokens * 4,
        ) ?? "";
    } while (excessTokens > 9);
  }

  let data: OpenAI.ChatCompletion;
  try {
    data = await openai.chat.completions.create(
      {
        ...openAiPayload,
        stream: false,
      },
      { signal: Context.current().cancellationSignal },
    );

    logger.info(`Response from AI received: ${stringify(data)}.`);
  } catch (err) {
    logger.error(`Error from AI received: ${stringify(err)}.`);
    return {
      code: StatusCode.Internal,
      contents: [],
      message: (err as Error).message,
    };
  }

  const response = data.choices[0];

  if (!response) {
    logger.error(`No data choice available in AI Model response.`);
    return {
      code: StatusCode.Internal,
      contents: [],
      message: `No data choice available in AI Model response`,
    };
  }

  if (!data.usage) {
    logger.error(`OpenAI returned no usage information for call`);
  } else {
    const { completion_tokens, prompt_tokens, total_tokens } = data.usage;
    logger.info(
      `Actual usage for iteration: prompt tokens: ${prompt_tokens}, completion tokens: ${completion_tokens}, total tokens: ${total_tokens}`,
    );

    if (estimatedPromptTokens) {
      logger.info(
        `Estimated prompt usage off by ${
          prompt_tokens - estimatedPromptTokens
        } tokens.`,
      );
    }
  }

  const usage = data.usage ?? {
    completion_tokens: 0,
    prompt_tokens: 0,
    total_tokens: 0,
  };

  return {
    code: StatusCode.Ok,
    contents: [
      {
        response,
        usage,
      },
    ],
    message: "Ok",
  };
};

/**
 * A map of the API consumer-facing model names to the values provided to OpenAI.
 * Allows for using preview models before they take over the general alias.
 */
export const modelAliasToSpecificModel = {
  "gpt-3.5-turbo": "gpt-3.5-turbo-1106", // bigger context window, will be the resolved value for gpt-3.5-turbo from 11
  // Dec 2023
  "gpt-4-turbo": "gpt-4-0125-preview",
  // preview only
  "gpt-4": "gpt-4", // this points to the latest available anyway as of 6 Dec 2023
} as const satisfies Record<InferenceModelName, PermittedOpenAiModel>;
