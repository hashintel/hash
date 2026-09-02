import { isToolPart, toToolRenderItem } from "./tool-list";

import type { PetrinautAiInteractiveTool } from "../../../../../types/ai-interactive-tool";
import type { PetrinautAiMessage } from "../types";

/**
 * True while a message carries a widget the user still has to answer. Hiding
 * one of these would strand the conversation: the assistant cannot continue
 * until the widget is submitted, and the user cannot see it to submit it.
 */
export const hasAwaitingInteractiveTool = (
  message: PetrinautAiMessage,
  interactiveTools: readonly PetrinautAiInteractiveTool[],
): boolean =>
  message.parts.some((part) => {
    if (!isToolPart(part)) {
      return false;
    }

    const tool = toToolRenderItem(message, part, interactiveTools);

    return tool.interactive !== undefined && tool.state === "input-available";
  });

/**
 * Spoken turns are written into the conversation as they happen — that is what
 * runs the tool calls that edit the net — but showing them would make the
 * transcript scroll under the user mid-sentence. They are held back visually
 * until the session ends.
 *
 * Two things are never held back: anything the user typed, and any widget
 * awaiting their input.
 */
export const keepVisibleDuringVoiceSession = (
  message: PetrinautAiMessage,
  interactiveTools: readonly PetrinautAiInteractiveTool[],
): boolean => {
  if (message.role === "user" && message.metadata?.source !== "voice") {
    return true;
  }

  return hasAwaitingInteractiveTool(message, interactiveTools);
};

/**
 * Messages from index `deferredFromIndex` onwards are the current session's.
 * Returns them split into what the transcript shows now and what it reveals
 * when the session ends.
 */
export const partitionVoiceSessionMessages = ({
  deferredFromIndex,
  interactiveTools,
  messages,
}: {
  deferredFromIndex: number;
  interactiveTools: readonly PetrinautAiInteractiveTool[];
  messages: PetrinautAiMessage[];
}): { deferred: PetrinautAiMessage[]; visible: PetrinautAiMessage[] } => {
  const deferred: PetrinautAiMessage[] = [];
  const visible: PetrinautAiMessage[] = [];

  messages.forEach((message, index) => {
    if (
      index < deferredFromIndex ||
      keepVisibleDuringVoiceSession(message, interactiveTools)
    ) {
      visible.push(message);
      return;
    }

    deferred.push(message);
  });

  return { deferred, visible };
};
