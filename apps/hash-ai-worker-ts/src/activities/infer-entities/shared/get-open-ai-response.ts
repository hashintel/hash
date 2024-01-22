import { Status, StatusCode } from "@local/status";
import { Context } from "@temporalio/activity";
import OpenAI from "openai";
import { promptTokensEstimate } from "openai-chat-tokens";

import { PermittedOpenAiModel } from "../inference-types";
import { log } from "../log";
import { stringify } from "../stringify";
import { firstUserMessageIndex } from "./first-user-message-index";
import { openai } from "./openai-client";

const modelToContextWindow: Record<PermittedOpenAiModel, number> = {
  "gpt-3.5-turbo-1106": 16_385,
  "gpt-4-1106-preview": 128_000,
  "gpt-4": 8_192,
};

const isPermittedModel = (
  model: OpenAI.ChatCompletionCreateParams["model"],
): model is PermittedOpenAiModel =>
  Object.keys(modelToContextWindow).includes(model);

export const getOpenAiResponse = async (
  openAiPayload: OpenAI.ChatCompletionCreateParams,
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

  let estimatedPromptTokens: number;
  let excessTokens: number;
  do {
    estimatedPromptTokens = promptTokensEstimate({
      messages: openAiPayload.messages,
      functions: openAiPayload.tools?.map((tool) => tool.function),
    });
    log(`Estimated prompt tokens: ${estimatedPromptTokens}`);

    excessTokens =
      estimatedPromptTokens + completionPayloadOverhead - modelContextWindow;

    if (excessTokens < 10) {
      break;
    }

    log(
      `Estimated prompt tokens (${estimatedPromptTokens}) + completion token overhead (${completionPayloadOverhead}) exceeds model context window (${modelContextWindow}), trimming original user text input by ${
        excessTokens / 4
      } characters.`,
    );

    const firstUserMessageContent =
      newCompletionPayload.messages[firstUserMessageIndex]!.content;

    newCompletionPayload.messages[firstUserMessageIndex]!.content =
      firstUserMessageContent?.slice(
        0,
        firstUserMessageContent.length - excessTokens * 4,
      ) ?? "";
  } while (excessTokens > 9);

  let data: OpenAI.ChatCompletion;
  try {
    data = await openai.chat.completions.create(
      {
        ...openAiPayload,
        stream: false,
      },
      { signal: Context.current().cancellationSignal },
    );

    log(`Response from AI received: ${stringify(data)}.`);
  } catch (err) {
    log(`Error from AI received: ${stringify(err)}.`);
    return {
      code: StatusCode.Internal,
      contents: [],
      message: (err as Error).message,
    };
  }

  const response = data.choices[0];

  if (!response) {
    log(`No data choice available in AI Model response.`);
    return {
      code: StatusCode.Internal,
      contents: [],
      message: `No data choice available in AI Model response`,
    };
  }

  if (!data.usage) {
    log(`OpenAI returned no usage information for call`);
  } else {
    const { completion_tokens, prompt_tokens, total_tokens } = data.usage;
    log(
      `Actual usage for iteration: prompt tokens: ${prompt_tokens}, completion tokens: ${completion_tokens}, total tokens: ${total_tokens}`,
    );
    log(
      `Estimated prompt usage off by ${
        prompt_tokens - estimatedPromptTokens
      } tokens.`,
    );
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
