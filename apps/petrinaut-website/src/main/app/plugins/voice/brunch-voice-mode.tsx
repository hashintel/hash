import {
  VoiceInterviewControl,
  type OpenAIVoiceConfig,
} from "./session/voice-interview-control";

import type {
  PetrinautAiVoiceMode,
  PetrinautAiVoiceModeContext,
} from "../_shared/chat/composer-control";
import type {
  BrunchPanelAdmissionTarget,
  BrunchPanelConversationTracker,
} from "../brunch/brunch-panel-transport";
import type { VoiceMediationHistory } from "./history/voice-mediation-history";
import type { ToolApprovalState } from "./live/live-brunch-bridge";
import type {
  FlueConversationSettlement,
  FlueConversationState,
} from "@flue/sdk";

/**
 * Binds the Voice interview control to one Brunch conversation: the tracker's
 * submission and admission methods become the control's props. `undefined`
 * without a voice configuration, which hides Voice mode.
 */
export const getBrunchVoiceMode = (
  config: OpenAIVoiceConfig | null | undefined,
  tracker?: BrunchPanelConversationTracker,
  settlements?: readonly FlueConversationSettlement[],
  snapshot?: FlueConversationState,
  mediationHistory?: VoiceMediationHistory,
  toolApprovalState?: (toolCallId: string) => ToolApprovalState | null,
): PetrinautAiVoiceMode | undefined => {
  if (!config) return undefined;

  const resolveInputSubmission = tracker?.submissionForInput.bind(tracker);
  const resolveResponseSubmission =
    tracker?.submissionsForResponse.bind(tracker);
  const subscribeToResponseMessageCompleted =
    tracker?.subscribeToResponseMessageCompleted.bind(tracker);
  const subscribeToResponseMessageStarted =
    tracker?.subscribeToResponseMessageStarted.bind(tracker);
  const subscribeToStopRequested =
    tracker?.subscribeToStopRequested.bind(tracker);
  const subscribeToAdmission =
    tracker === undefined
      ? undefined
      : (target: BrunchPanelAdmissionTarget, listener: (id: string) => void) =>
          tracker.subscribeToAdmission(target, ({ admission }) =>
            listener(admission.submissionId),
          );
  const subscribeToAdmissionFailure =
    tracker?.subscribeToAdmissionFailure.bind(tracker);

  return (context: PetrinautAiVoiceModeContext) => (
    <VoiceInterviewControl
      {...context}
      config={config}
      mediationHistory={mediationHistory}
      toolApprovalState={toolApprovalState}
      settlements={settlements}
      // Voice only observes this snapshot. Message replacement remains gated
      // independently by followMessages.canReplace in the demo shell.
      snapshot={snapshot}
      resolveInputSubmission={resolveInputSubmission}
      resolveResponseSubmission={resolveResponseSubmission}
      subscribeToResponseMessageCompleted={subscribeToResponseMessageCompleted}
      subscribeToResponseMessageStarted={subscribeToResponseMessageStarted}
      subscribeToStopRequested={subscribeToStopRequested}
      subscribeToAdmission={subscribeToAdmission}
      subscribeToAdmissionFailure={subscribeToAdmissionFailure}
    />
  );
};
