/** Session connectivity or, when known, which side holds the turn. */
export type PetrinautAiVoiceSessionPhase =
  | "connected"
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
  /** Whether the current canonical assistant response is safe to replay. */
  canReadFullResponse?: boolean;
  /** Whether the final segment of the canonical response is safe to repeat. */
  canRepeatQuestion?: boolean;
  /** Whether browser-blocked session audio can be retried by the user. */
  canRetryPlayback?: boolean;
  /** Whether the user can cancel Voice output and start their turn. */
  canTakeTurn?: boolean;
  /** Whether speaking can interrupt assistant audio. */
  interruptionBySpeaking?: boolean;
  errorMessage: string | null;
  /** Whether microphone capture is muted independently of whose turn it is. */
  microphoneMuted: boolean;
  /** Normalized 0–1 input level driving the listening indicator. */
  microphoneLevel: number;
  /** Temporary operational status shown in place of the current phase. */
  notice?: string | null;
  phase: PetrinautAiVoiceSessionPhase;
  /** Recoverable issue retained behind the Voice warning indicator. */
  warningMessage?: string | null;
};
