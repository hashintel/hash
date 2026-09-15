import type { PetrinautAiVoiceSessionPhase } from "../../../types/ai-assistant-composer-control";

/**
 * Shared between the dock's visible status and the live region announcing it,
 * so the two can never describe the same session differently.
 */
export const voiceSessionStatusLabel = (
  phase: PetrinautAiVoiceSessionPhase,
): string => {
  switch (phase) {
    case "connected":
      return "Connected";
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
  audioControls: "Audio controls",
  audioOptions: "Audio options",
  collapse: "Hide conversation",
  end: "End voice mode",
  expand: "Show conversation",
  interruptionBySpeaking: "Interruption by speaking",
  mute: "Mute microphone",
  muteSpeaker: "Mute speaker",
  pause: "Pause voice mode",
  readFullResponse: "Read full response",
  reconnect: "Reconnect voice mode",
  repeatQuestion: "Repeat question",
  retryPlayback: "Play voice audio",
  resume: "Resume voice mode",
  speakerVolume: "Speaker volume",
  stop: "Stop AI response",
  takeTurn: "Your turn",
  unmute: "Unmute microphone",
  unmuteSpeaker: "Unmute speaker",
} as const;

export const voiceSetupLabels = {
  collapse: "Collapse voice setup",
  expand: "Expand voice setup",
  region: "Voice setup",
  status: "Voice setup",
} as const;
