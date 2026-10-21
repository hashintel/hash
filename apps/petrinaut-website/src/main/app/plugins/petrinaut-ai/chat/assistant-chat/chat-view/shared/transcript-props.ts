import type { PetrinautAiMessage } from "../../../ai-message";
import type { PetrinautAiInteractiveTool } from "../../../interactive-tool";
import type { PetrinautAiToolPresentationResolver } from "../../../tool-presentation";
import type { AiToolTarget } from "../../tool-summaries";
import type { AiExperimentState } from "../experiment-card";
import type { OnInteractiveToolSubmit } from "../tool-list";
import type { RefObject } from "react";

/**
 * Callbacks read through a ref so identity churn from the panel's inline
 * arrow functions doesn't bust the per-message memo.
 */
export type MessageHandlersRef = RefObject<{
  onInteractiveToolSubmit?: OnInteractiveToolSubmit;
  onSelectToolTarget?: (target: AiToolTarget) => void;
  onRetryMessage: (messageId: string) => void;
}>;

/** What every transcript presentation needs to render its messages. */
export type TranscriptProps = {
  experimentStates?: Record<string, AiExperimentState>;
  handlersRef: MessageHandlersRef;
  hiddenToolNames?: ReadonlySet<string>;
  interactiveTools: readonly PetrinautAiInteractiveTool[];
  messages: PetrinautAiMessage[];
  onCancelExperiment?: (toolCallId: string) => void;
  resolveToolPresentation?: PetrinautAiToolPresentationResolver;
  stopped: boolean;
};
