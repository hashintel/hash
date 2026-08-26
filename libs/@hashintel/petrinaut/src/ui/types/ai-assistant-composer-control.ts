import type { PetrinautAiMessage } from "../views/Editor/panels/ai-assistant-panel/types";
import type { ReactNode } from "react";

/** Current lifecycle state of Petrinaut's AI SDK conversation. */
export type PetrinautAiComposerStatus =
  | "submitted"
  | "streaming"
  | "ready"
  | "error";

/** Outcome from submitting finalized text through the assistant composer. */
export type PetrinautAiComposerSubmitTextResult =
  | { kind: "message"; messageId: string }
  | { kind: "interactive-tool"; toolCallId: string };

/** Stable controls and current conversation state supplied to a host control. */
export type PetrinautAiComposerControlContext = {
  conversationId?: string;
  messages: PetrinautAiMessage[];
  status: PetrinautAiComposerStatus;
  /** Call from an event handler or effect, never while rendering. */
  stop: () => Promise<void>;
  /** Call from an event handler or effect, never while rendering. */
  submitText: (params: {
    id?: string;
    text: string;
  }) => Promise<PetrinautAiComposerSubmitTextResult>;
};

/** Render callback for a host-owned control inside the assistant composer. */
export type PetrinautAiComposerControl = (
  context: PetrinautAiComposerControlContext,
) => ReactNode;
