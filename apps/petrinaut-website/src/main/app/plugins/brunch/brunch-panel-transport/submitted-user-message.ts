import {
  ledgerCommentsMessage,
  parseLedgerComments,
  petrinautContextualUserMessageBody,
} from "@hashintel/brunch-agent";
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
 * turn never carries it. A turn whose text is a body of Ledger comments goes
 * to Brunch as the comment signal.
 */
export const brunchSubmittedUserMessage = (
  messages: readonly UIMessage[],
  submissionContext?: SubmissionContext,
): SubmittedUserMessage => {
  const submitted = finalUserMessage(
    messages.filter(({ id }) => id !== petrinautDiagnosticsContextMessageId),
  );
  if (submitted.message.kind !== "user") return submitted;
  const comments = parseLedgerComments(submitted.message.body);
  if (comments !== undefined) {
    return {
      messageId: submitted.messageId,
      message: ledgerCommentsMessage(comments),
    };
  }
  if (submissionContext === undefined) return submitted;
  return {
    messageId: submitted.messageId,
    message: {
      kind: "user",
      body: petrinautContextualUserMessageBody({
        userText: submitted.message.body,
        diagnosticsContext: "",
        submissionContext,
      }),
    },
  };
};
