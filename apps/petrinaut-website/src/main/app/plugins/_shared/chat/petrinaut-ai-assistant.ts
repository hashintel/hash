/** The configuration an assistant plugin gives the chat. */

import type { PetrinautAiMessage, PetrinautAiTransport } from "./ai-message";
import type { PetrinautAiAutomaticTool } from "./automatic-tool";
import type {
  PetrinautAiComposerControl,
  PetrinautAiVoiceMode,
} from "./composer-control";
import type { PetrinautAiInteractiveTool } from "./interactive-tool";
import type { PetrinautAiToolPresentationResolver } from "./tool-presentation";

/**
 * What `requestStop` reports. `"stop-requested"`: the chat also cancels the
 * local stream. `"already-settled"`: the response had already ended.
 */
export type PetrinautAiStopResult = "already-settled" | "stop-requested";

/**
 * Visual style of the chat: `"stock"` for Petrinaut's own, `"brunch"` for the
 * Brunch assistant's.
 */
export type PetrinautAiAssistantPresentation = "stock" | "brunch";

/** An assistant's chat: transport, stored history, tools and transcript style. */
export type PetrinautAiAssistant = {
  /** Visual style of the chat. Defaults to `"stock"`. */
  presentation?: PetrinautAiAssistantPresentation;
  /** Label of the chat tab, or of the header without tabs. Defaults to the plugin's `assistant.label`. */
  primaryLabel?: string;
  /** Status text while a response is submitted or streaming. */
  workingLabel?: string;
  /** Customizes how the transcript shows each tool call. */
  resolveToolPresentation?: PetrinautAiToolPresentationResolver;
  /** Whether the user may clear the conversation. Defaults to `true`. */
  canClearMessages?: boolean;
  /**
   * Id of the conversation; a new id remounts the chat with fresh state.
   * Generated when omitted.
   */
  conversationId?: string;
  /**
   * Tool calls this assistant runs itself while the response is still
   * streaming, reporting their results itself.
   */
  inBandBrowserTools?: {
    /** Whether this assistant runs the named tool itself. */
    has: (toolName: string) => boolean;
    /**
     * Runs one tool call, once the previous call settles; `signal` aborts on Stop.
     * Call `execute` at most once, with the input to run, to have the chat run the tool.
     * A `createExperiment` call lets the next call start once `execute` starts.
     */
    run: (
      call: {
        /** Id of this tool call, from the AI SDK. */
        toolCallId: string;
        /** Name of the tool the model called, one that `has` accepts. */
        toolName: string;
        /** The arguments the model sent for this call. */
        input: unknown;
        /**
         * Aborts when the user stops the response, sends a new message,
         * clears the chat or switches conversation.
         */
        signal: AbortSignal;
      },
      execute: (input: unknown) => Promise<unknown>,
    ) => Promise<void>;
  };
  /** Tools the chat runs for this assistant without user input, against the mounted editor. */
  automaticTools?: readonly PetrinautAiAutomaticTool[];
  /** Tools the user answers through a widget shown inline in the conversation. */
  interactiveTools?: readonly PetrinautAiInteractiveTool[];
  /**
   * Stored transcript the conversation starts from, applied once per
   * conversation. With `followMessages`, applied again whenever `canReplace()` allows.
   */
  messages?: PetrinautAiMessage[];
  /**
   * Rewrites messages for the transcript only, for example to add voice
   * captions. What is sent, stored and passed to controls stays unchanged.
   * Do not mutate the input.
   */
  mapMessagesForDisplay?: (
    messages: PetrinautAiMessage[],
  ) => PetrinautAiMessage[];
  /**
   * Replaces the transcript with each new `messages` while the chat is idle
   * and `canReplace()` returns true, which it should only once `messages`
   * holds every local turn. Tool calls in followed history never run.
   */
  followMessages?: { canReplace: () => boolean };
  /** Called when the user clears the conversation, after `onMessages([])`. */
  onClearMessages?: () => void;
  /**
   * Receives the whole transcript each time a response ends or is stopped,
   * and `[]` when the user clears the conversation.
   */
  onMessages?: (messages: PetrinautAiMessage[]) => void;
  /**
   * Stops the response at its source, such as a server run.
   * Omitted: Stop cancels only the local stream.
   */
  requestStop?: () => Promise<PetrinautAiStopResult>;
  /** Renders the assistant's own control in the composer, next to the send button. */
  renderComposerControl?: PetrinautAiComposerControl;
  /** Renders the assistant's Voice mode. Omitted: the composer offers no Voice mode. */
  renderVoiceMode?: PetrinautAiVoiceMode;
  /** Sends each request and streams the reply. Each send uses the latest value. */
  transport: PetrinautAiTransport;
};
