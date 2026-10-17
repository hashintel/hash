import { petrinautDiagnosticsContextMessageId } from "@hashintel/petrinaut-core";
import { finalUserMessage } from "@local/flue-aisdk-transport";

import type { SubmittedUserMessage } from "@local/flue-aisdk-transport";
import type { UIMessage } from "ai";

/**
 * Admit the human's turn as they wrote it. Petrinaut's assistant appends a
 * reserved diagnostics message after client tool results; Brunch reads
 * diagnostics through its own tools, so the turn never carries it.
 */
export const brunchSubmittedUserMessage = (
  messages: readonly UIMessage[],
): SubmittedUserMessage =>
  finalUserMessage(
    messages.filter(({ id }) => id !== petrinautDiagnosticsContextMessageId),
  );
