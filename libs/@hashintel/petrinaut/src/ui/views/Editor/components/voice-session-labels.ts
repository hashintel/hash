import type { PetrinautAiVoiceSessionPhase } from "../../../types/ai-assistant-composer-control";

/**
 * Shared between the dock's visible status and the live region announcing it,
 * so the two can never describe the same session differently.
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
    case "muted":
      return "Muted";
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
  mute: "Mute microphone",
  pause: "Pause voice mode",
  reconnect: "Reconnect voice mode",
  resume: "Resume voice mode",
  unmute: "Unmute microphone",
} as const;
