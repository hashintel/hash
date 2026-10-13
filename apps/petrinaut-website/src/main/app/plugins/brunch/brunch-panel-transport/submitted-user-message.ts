import {
  petrinautContextualUserMessageBody,
  petrinautWordsUserMessageBody,
} from "@hashintel/brunch-agent-plugin-sdcpn";
import { CLIENT_TOOL_RESULT_CONTEXT_MAX_LENGTH } from "@hashintel/brunch-agent/client-tools";
import { petrinautDiagnosticsContextMessageId } from "@hashintel/petrinaut-core";
import { finalUserMessage } from "@local/flue-aisdk-transport";

import type { SubmittedUserMessage } from "@local/flue-aisdk-transport";
import type { UIMessage } from "ai";

const submittedDiagnosticsContext = (
  messages: readonly UIMessage[],
): string | undefined => {
  const [message, ...duplicates] = messages.filter(
    ({ id }) => id === petrinautDiagnosticsContextMessageId,
  );
  if (message === undefined) return undefined;
  if (duplicates.length > 0) {
    throw new Error("The submission has duplicate diagnostics context.");
  }
  const part = message.parts[0];
  if (
    message !== messages.at(-1) ||
    message.role !== "user" ||
    message.parts.length !== 1 ||
    part?.type !== "text" ||
    part.text.length === 0 ||
    Array.from(part.text).length > CLIENT_TOOL_RESULT_CONTEXT_MAX_LENGTH
  ) {
    throw new Error("The submission has invalid or stale diagnostics context.");
  }
  return part.text;
};

/**
 * Admit the human's turn, framing any trailing diagnostics context and the
 * host-captured words snapshot into its body so the server can separate human
 * evidence from host data. An empty snapshot sends an ordinary message, which
 * also clears Brunch's snapshot.
 */
export const brunchSubmittedUserMessage = (
  messages: readonly UIMessage[],
  words?: readonly string[],
): SubmittedUserMessage => {
  const diagnosticsContext = submittedDiagnosticsContext(messages);
  const hasWords = words !== undefined && words.length > 0;
  if (diagnosticsContext === undefined && !hasWords) {
    return finalUserMessage(messages);
  }
  const userMessage = finalUserMessage(
    diagnosticsContext === undefined ? messages : messages.slice(0, -1),
  );
  return {
    messageId: userMessage.messageId,
    body: hasWords
      ? petrinautWordsUserMessageBody({
          userText: userMessage.body,
          words,
          ...(diagnosticsContext === undefined ? {} : { diagnosticsContext }),
        })
      : petrinautContextualUserMessageBody({
          userText: userMessage.body,
          diagnosticsContext: diagnosticsContext ?? "",
        }),
  };
};
