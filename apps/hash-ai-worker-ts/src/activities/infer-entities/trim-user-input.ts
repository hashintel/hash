import OpenAI from "openai";
import { promptTokensEstimate } from "openai-chat-tokens";

import { CompletionPayload, PermittedOpenAiModel } from "./inference-types";
import { log } from "./log";

/**
 * Returns a new CompletionPayload with the user input trimmed to fit within the model's context window,
 * and the estimated number of prompt tokens used in the entire payload.
 */
export const trimUserInput = ({
  completionPayload,
  tools,
}: {
  completionPayload: CompletionPayload;
  tools: OpenAI.Chat.Completions.ChatCompletionTool[];
}): {
  completionPayload: CompletionPayload;
  estimatedPromptTokens: number;
} => {
  const modelContextWindow = modelToContextWindow[completionPayload.model];
  const completionPayloadOverhead = 4_096;

  const newCompletionPayload = { ...completionPayload };

  let estimatedPromptTokens: number;
  let excessTokens: number;
  do {
    estimatedPromptTokens = promptTokensEstimate({
      messages: completionPayload.messages,
      functions: tools.map((tool) => tool.function),
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

  return {
    completionPayload: newCompletionPayload,
    estimatedPromptTokens,
  };
};
