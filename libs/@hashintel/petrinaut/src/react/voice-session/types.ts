/** Which side of a Voice session currently holds the turn. */
export type PetrinautAiVoiceSessionPhase =
  | "connecting"
  | "error"
  | "listening"
  | "muted"
  | "paused"
  | "speaking"
  | "thinking";

/**
 * Live state of a host-owned Voice session.
 *
 * Petrinaut renders every live Voice surface from this snapshot, so hosts
 * report state rather than rendering their own status UI. Report it from an
 * effect: it changes at microphone-sampling rate.
 */
export type PetrinautAiVoiceSessionState = {
  errorMessage: string | null;
  /** Whether microphone capture is muted independently of whose turn it is. */
  microphoneMuted: boolean;
  /** Normalized 0–1 input level driving the listening indicator. */
  microphoneLevel: number;
  phase: PetrinautAiVoiceSessionPhase;
};
