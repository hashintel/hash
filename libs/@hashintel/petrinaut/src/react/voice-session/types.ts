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

/** Host-provided audio preferences and browser device availability. */
export type VoiceAudioSettingsState = {
  voice: string;
  activeVoice: string;
  voices: readonly { value: string; text: string }[];
  voiceSaveError?: string | null;
  /** Omitted when the provider does not support numeric speed. */
  speed?: number;
  devices: {
    microphones: readonly { value: string; text: string }[];
    speakers: readonly { value: string; text: string }[];
    microphoneId: string;
    speakerId: string;
    canSelectSpeaker: boolean;
    canRequestSpeaker: boolean;
    busy: boolean;
    message: string | null;
  };
};

export type VoiceAudioSettingsActions = {
  setVoice: (voice: string) => void;
  setSpeed?: (speed: number) => void;
  refreshDevices: () => void;
  setMicrophoneDevice: (deviceId: string) => void;
  setSpeakerDevice: (deviceId: string) => void;
  requestSpeaker: () => void;
};

/**
 * Live state of a host-owned Voice session.
 *
 * Petrinaut renders every live Voice surface from this snapshot, so hosts
 * report state rather than rendering their own status UI. Report it from an
 * effect: it changes at microphone-sampling rate.
 */
export type PetrinautAiVoiceSessionState = {
  audioSettings?: VoiceAudioSettingsState;
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
  /** Whether assistant audio is muted independently of its retained volume. */
  speakerMuted?: boolean;
  /** Normalized 0–1 assistant audio volume. */
  speakerVolume?: number;
  /** Recoverable issue retained behind the Voice warning indicator. */
  warningMessage?: string | null;
};
