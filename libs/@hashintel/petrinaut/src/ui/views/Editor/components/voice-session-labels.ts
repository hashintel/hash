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
  playbackOptions: "Voice playback options",
  readFullResponse: "Read full response",
  reconnect: "Reconnect voice mode",
  repeatQuestion: "Repeat question",
  resume: "Resume voice mode",
  takeTurn: "Your turn",
  unmute: "Unmute microphone",
} as const;
