import type { PetrinautAiVoiceSessionPhase } from "../../../types/ai-assistant-composer-control";

/**
 * Shared between the assistant dock and the canvas toolbar segment so the two
 * surfaces can never announce the same session differently.
 */
export const voiceSessionStatusLabel = (
  phase: PetrinautAiVoiceSessionPhase,
): string => {
  switch (phase) {
    case "connecting":
      return "Connecting";
    case "error":
      return "Voice interrupted";
    case "listening":
      return "Listening";
    case "paused":
      return "Paused";
    case "speaking":
      return "Speaking";
    case "thinking":
      return "Thinking";
  }
};

export const voiceSessionActionLabels = {
  end: "End voice mode",
  pause: "Pause voice mode",
  reconnect: "Reconnect voice mode",
  resume: "Resume voice mode",
} as const;
