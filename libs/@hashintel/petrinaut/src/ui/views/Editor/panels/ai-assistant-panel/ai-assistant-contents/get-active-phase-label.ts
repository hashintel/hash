import {
  getLatestNetDefinitionToolName,
  getNetCompilationErrorsToolName,
} from "@hashintel/petrinaut-core";

import { isPartActive } from "./get-message-render-items";
import { extractReasoningHeading } from "./reasoning";
import { getToolName, getToolSummaryFromPart, isToolPart } from "./tool-list";

import type { PetrinautAiMessage } from "../types";

/**
 * Walks an assistant message's parts to derive a short status label for the
 * footer of the active message. Returns `undefined` when no part is currently
 * streaming/awaiting input.
 *
 * Falls back gracefully when provider-specific signals (reasoning heading,
 * tool summary title) aren't available — the user just sees the generic phase
 * verb (`Thinking…`, `Working on a change…`, etc.).
 */
export const getActivePhaseLabel = (
  message: PetrinautAiMessage,
): string | undefined => {
  const activePart = [...message.parts].reverse().find(isPartActive);
  if (!activePart) {
    return undefined;
  }

  if (activePart.type === "reasoning") {
    const { heading } = extractReasoningHeading(activePart.text, true);
    return heading ? `Thinking about ${heading}` : "Thinking";
  }

  if (activePart.type === "text") {
    return "Writing reply";
  }

  if (isToolPart(activePart)) {
    const toolName = getToolName(activePart);
    if (toolName === getLatestNetDefinitionToolName) {
      return "Checking the current net";
    }
    if (toolName === getNetCompilationErrorsToolName) {
      return "Checking for compilation errors";
    }
    const summary = getToolSummaryFromPart(activePart);
    const label = summary.title || toolName;
    return label ? `Working on ${label}` : "Working on a change";
  }

  return undefined;
};
