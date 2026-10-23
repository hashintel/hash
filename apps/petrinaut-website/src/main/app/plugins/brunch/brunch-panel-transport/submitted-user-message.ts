import { petrinautContextualUserMessageBody } from "@hashintel/brunch-agent";
import { petrinautDiagnosticsContextMessageId } from "@hashintel/petrinaut-core";
import { finalUserMessage } from "@local/flue-aisdk-transport";

import type { SubmissionContext } from "@hashintel/brunch-agent";
import type { SubmittedUserMessage } from "@local/flue-aisdk-transport";
import type { UIMessage } from "ai";

/**
 * Admit the human's turn as they wrote it, framing this submission's host
 * context into its body so the server can separate human evidence from host
 * data. Petrinaut's assistant appends a reserved diagnostics message after
 * client tool results; Brunch reads diagnostics through its own tools, so the
 * turn never carries it.
 */
export const brunchSubmittedUserMessage = (
  messages: readonly UIMessage[],
  submissionContext?: SubmissionContext,
): SubmittedUserMessage => {
  const userMessage = finalUserMessage(
    messages.filter(({ id }) => id !== petrinautDiagnosticsContextMessageId),
  );
  if (submissionContext === undefined) return userMessage;
  return {
    messageId: userMessage.messageId,
    body: petrinautContextualUserMessageBody({
      userText: userMessage.body,
      diagnosticsContext: "",
      submissionContext,
    }),
  };
};
