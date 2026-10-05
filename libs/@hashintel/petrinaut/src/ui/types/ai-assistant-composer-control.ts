import type {
  PetrinautAiVoiceSessionPhase,
  PetrinautAiVoiceSessionState,
  VoiceAudioSettingsActions,
} from "../../react/voice-session/types";
import type { PetrinautAiMessage } from "../views/Editor/panels/ai-assistant-panel/types";
import type { ReactNode } from "react";

export type { PetrinautAiVoiceSessionPhase, PetrinautAiVoiceSessionState };

/** How the user talks to the assistant: by typing in the composer, or by voice. */
export type PetrinautAiInputMode = "text" | "voice";

/**
 * Conversation state: `submitted` awaits a reply, `streaming` receives it,
 * `ready` is idle and `error` means the last turn or submission failed.
 * Stays `submitted` between a step's tool calls and its automatic follow-up.
 */
export type PetrinautAiComposerStatus =
  | "submitted"
  | "streaming"
  | "ready"
  | "error";

/** What `submitText` did with the text: sent a message, or answered a tool call. */
export type PetrinautAiComposerSubmitTextResult =
  | {
      kind: "message";
      /** Id of the user message that was sent. */
      messageId: string;
    }
  | {
      kind: "interactive-tool";
      /** Id of the pending tool call the text answered. */
      toolCallId: string;
    };

/**
 * Sends text as the user's next message, or as the answer to a pending tool call.
 * Rejects on blank text, during a reply, or when several pending calls accept it.
 */
export type PetrinautAiComposerSubmitText = (params: {
  /** Id for the new user message. Generated when omitted. */
  id?: string;
  /** Marks the text as spoken: it is sent untrimmed and leaves the draft alone. */
  source?: "voice";
  /**
   * `auto` answers the one pending tool call with `fromComposerText`, if any.
   * `message` always sends a new message. Defaults to `auto`.
   */
  target?: "auto" | "message";
  /** Keeps the user's unsent composer text instead of clearing it. */
  preserveDraft?: boolean;
  /** What to send. Typed text is trimmed, and blank text is rejected. */
  text: string;
}) => Promise<PetrinautAiComposerSubmitTextResult>;

/** Conversation state and actions passed to `renderComposerControl` on every render. */
export type PetrinautAiComposerControlContext = {
  /** Id of the conversation: the assistant's `conversationId`, or a generated one. */
  conversationId: string;
  /** The conversation's messages, before `mapMessagesForDisplay`. */
  messages: PetrinautAiMessage[];
  /** Whether a reply is pending, streaming, finished or failed. */
  status: PetrinautAiComposerStatus;
  /** True after the user stopped the latest reply, until the next turn starts. */
  stopped?: boolean;
  /**
   * Stops the reply in progress, through the assistant's `requestStop` if it has one.
   * Stable across renders. Call from an event handler or effect, never during render.
   */
  stop: () => Promise<void>;
  /**
   * Sends text as the user's next message, or as the answer to a pending tool call.
   * Stable across renders. Call from an event handler or effect, never during render.
   */
  submitText: PetrinautAiComposerSubmitText;
  /**
   * Reports whether an experiment the assistant runs itself is in progress.
   * The Brunch composer shows it as a hint. Call from an effect; the returned
   * cleanup clears only this report.
   */
  reportExperimentRunning?: (running: boolean) => () => void;
};

/** Renders the assistant's own control in the composer, next to the send button. */
export type PetrinautAiComposerControl = (
  context: PetrinautAiComposerControlContext,
) => ReactNode;

/**
 * Controls Petrinaut calls to drive a Voice session, for `registerVoiceModeControls`.
 * The Voice dock offers an optional control only when it is given.
 */
export type PetrinautAiVoiceModeControls = {
  /** Handlers for the voice, speed and device settings in the dock's audio menu. */
  audioSettings?: VoiceAudioSettingsActions;
  /**
   * Ends the session: stop Voice output synchronously, then disconnect the provider.
   * Called when the user ends Voice, switches to text, or types a message mid-session.
   */
  end: () => Promise<void>;
  /**
   * Pauses microphone capture and Voice output synchronously.
   * Called when the user closes the assistant panel.
   */
  pause: () => void;
  /**
   * Restarts a dropped session in the same conversation.
   * Offered in the dock while the session phase is `error`.
   */
  reconnect: () => void;
  /**
   * Restarts microphone capture after `pause`.
   * Offered in the dock while the session phase is `paused`.
   */
  resume: () => void;
  /**
   * Replays the latest assistant reply in full.
   * Enabled while the session state's `canReadFullResponse` is true.
   */
  readFullResponse?: () => void;
  /**
   * Replays the question that ended the latest assistant reply.
   * Enabled while the session state's `canRepeatQuestion` is true.
   */
  repeatQuestion?: () => void;
  /**
   * Mutes or unmutes the microphone while the session and assistant speech carry on.
   * Use `pause` to suspend the whole session instead.
   */
  setMicrophoneMuted: (muted: boolean) => void;
  /** Sets whether the user's speech interrupts assistant playback. */
  setInterruptionBySpeaking?: (enabled: boolean) => void;
  /** Mutes or unmutes assistant audio, keeping its volume. */
  setSpeakerMuted?: (muted: boolean) => void;
  /** Sets assistant audio volume from 0 to 1, leaving mute unchanged. */
  setSpeakerVolume?: (volume: number) => void;
  /**
   * Cuts off Voice output and hands the turn to the user's microphone.
   * Offered while the state's `canTakeTurn` is true and speech interruption is off.
   */
  takeTurn?: () => Promise<void> | void;
};

/**
 * Voice controls where `reconnect`, `resume` and `setMicrophoneMuted` are optional,
 * for `registerVoiceModeSessionControls`.
 */
export type PetrinautAiVoiceModeSessionControls = Omit<
  PetrinautAiVoiceModeControls,
  "reconnect" | "resume" | "setMicrophoneMuted"
> &
  Partial<
    Pick<
      PetrinautAiVoiceModeControls,
      "reconnect" | "resume" | "setMicrophoneMuted"
    >
  > & {
    /**
     * Retries session audio the browser blocked.
     * Called from the dock's retry button while `canRetryPlayback` is true.
     */
    retryPlayback?: () => void;
  };

/** Conversation state and Voice actions passed to `renderVoiceMode` on every render. */
export type PetrinautAiVoiceModeContext = PetrinautAiComposerControlContext & {
  /** False while a spoken turn already waits for the chat to settle. */
  canAcceptVoiceInput: boolean;
  /** Whether the composer is in text or Voice mode. */
  inputMode: PetrinautAiInputMode;
  /** Whether the assistant panel is open. */
  isAiAssistantOpen: boolean;
  /**
   * Hands Petrinaut the session's controls. Returns a function that unregisters them.
   * Unregistering also clears the reported session state. Call from an effect.
   */
  registerVoiceModeControls: (
    controls: PetrinautAiVoiceModeControls,
  ) => () => void;
  /**
   * Like `registerVoiceModeControls`, with fewer required controls plus `retryPlayback`.
   * Returns a function that unregisters them.
   */
  registerVoiceModeSessionControls?: (
    controls: PetrinautAiVoiceModeSessionControls,
  ) => () => void;
  /**
   * Publishes the live session state that the Voice dock renders.
   * Pass `null` once no session is running.
   */
  reportVoiceSessionState: (state: PetrinautAiVoiceSessionState | null) => void;
  /** Switches between text and Voice input. Switching to text ends a live session. */
  setInputMode: (mode: PetrinautAiInputMode) => void;
  /**
   * Marks a Voice session as live. While true, the chat cannot be cleared and
   * typed input or a switch to text ends the session first.
   */
  setVoiceActive: (active: boolean) => void;
  /**
   * Sends one finished spoken turn. While a reply is in progress, Petrinaut
   * holds the turn and sends it once the chat is ready.
   * Rejects when another turn is already held or the conversation is in error.
   */
  submitVoiceInput: (
    params: Omit<
      Parameters<PetrinautAiComposerControlContext["submitText"]>[0],
      "source"
    > & {
      /**
       * Withdraws the turn while Petrinaut still holds it, for example when the
       * session ends. A turn already sent is not cancelled.
       */
      readonly signal?: AbortSignal;
    },
  ) => Promise<PetrinautAiComposerSubmitTextResult>;
};

/** Renders the assistant's Voice mode, kept mounted in both input modes. */
export type PetrinautAiVoiceMode = (
  context: PetrinautAiVoiceModeContext,
) => ReactNode;
