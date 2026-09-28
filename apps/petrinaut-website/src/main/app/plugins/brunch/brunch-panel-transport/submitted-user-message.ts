import { CLIENT_TOOL_RESULT_CONTEXT_MAX_LENGTH } from "@hashintel/brunch-agent/client-tools";
import { petrinautContextualUserMessageBody } from "@hashintel/brunch-agent/contextual-user-message";
import { finalUserMessage } from "@local/flue-aisdk-transport";

import type { SubmittedUserMessage } from "@local/flue-aisdk-transport";
import type { UIMessage } from "ai";

/** The message id Petrinaut's diagnostics-aware transport appends. */
const diagnosticsContextMessageId = "petrinaut-diagnostics-context";

const submittedDiagnosticsContext = (
  messages: readonly UIMessage[],
): string | undefined => {
  const [message, ...duplicates] = messages.filter(
    ({ id }) => id === diagnosticsContextMessageId,
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
 * Admit the human's turn, framing any trailing diagnostics context into its
 * body so the server can separate human evidence from host diagnostics.
 */
export const brunchSubmittedUserMessage = (
  messages: readonly UIMessage[],
): SubmittedUserMessage => {
  const diagnosticsContext = submittedDiagnosticsContext(messages);
  if (diagnosticsContext === undefined) return finalUserMessage(messages);
  const userMessage = finalUserMessage(messages.slice(0, -1));
  return {
    messageId: userMessage.messageId,
    body: petrinautContextualUserMessageBody({
      userText: userMessage.body,
      diagnosticsContext,
    }),
  };
};
