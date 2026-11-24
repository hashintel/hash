import {
  ledgerCommentsMessage,
  parseLedgerComments,
  petrinautContextualUserMessageBody,
  petrinautSubmissionContext,
} from "@hashintel/brunch-agent";
import { petrinautDiagnosticsContextMessageId } from "@hashintel/petrinaut-core";
import { finalUserMessage } from "@local/flue-aisdk-transport";

import { isLedgerCommentsMessage } from "../../shared/ledger-comments-turn";

import type { PetrinautSubmissionContext } from "@hashintel/brunch-agent";
import type { SubmittedUserMessage } from "@local/flue-aisdk-transport";
import type { UIMessage } from "ai";

/**
 * Admit the human's turn as they wrote it, framing this submission's host
 * context into its body so the server can separate human evidence from host
 * data. Petrinaut's assistant appends a reserved diagnostics message after
 * client tool results; Brunch reads diagnostics through its own tools, so the
 * turn never carries it. A turn marked as Ledger comments goes to Brunch as
 * the comment signal, carrying the host's version load.
 */
export const brunchSubmittedUserMessage = (
  messages: readonly UIMessage[],
  context: PetrinautSubmissionContext = {},
): SubmittedUserMessage => {
  const turn = messages.filter(
    ({ id }) => id !== petrinautDiagnosticsContextMessageId,
  );
  const submitted = finalUserMessage(turn);
  if (submitted.message.kind !== "user") return submitted;
  const userMessage = turn.find(({ id }) => id === submitted.messageId);
  if (userMessage !== undefined && isLedgerCommentsMessage(userMessage)) {
    const comments = parseLedgerComments(submitted.message.body);
    if (comments === undefined)
      throw new Error("The Ledger comments turn holds no comments.");
    return {
      messageId: submitted.messageId,
      message: ledgerCommentsMessage(
        comments,
        context.versionLoad === undefined
          ? {}
          : { versionLoad: context.versionLoad },
      ),
    };
  }
  const submissionContext = petrinautSubmissionContext(context);
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
