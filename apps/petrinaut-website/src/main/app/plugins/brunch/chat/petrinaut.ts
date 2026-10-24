import type {
  PetrinautAiComposerControl,
  PetrinautAiInputMode,
  PetrinautAiVoiceMode,
} from "./ai-assistant-composer-control";
import type {
  PetrinautAiMessage,
  PetrinautAiTransport,
} from "./ai-assistant-panel";
import type { PetrinautAiMutationExecutor } from "./ai-assistant-panel/types";
import type { PetrinautAiAutomaticTool } from "./ai-automatic-tool";
import type { PetrinautAiInteractiveTool } from "./ai-interactive-tool";
import type { PetrinautDocHandle } from "@hashintel/petrinaut-core";
import type { ReactNode } from "react";

/** Sends each request and streams the reply. */
export type PetrinautAiChatTransport = PetrinautAiTransport;

/** What a durable Stop request reports. */
export type PetrinautAiStopResult = "already-settled" | "stop-requested";

/** The chat's visual presentation. */
export type PetrinautAiAssistantPresentation = "stock" | "brunch";

/** A tool call's lifecycle, as its card shows it. */
export type PetrinautAiToolPresentationState = "pending" | "success" | "error";

/** A tool card's tone. */
export type PetrinautAiToolPresentationTone =
  | "danger"
  | "info"
  | "neutral"
  | "pending"
  | "success";

/** What a tool presentation resolver reads. */
export type PetrinautAiToolPresentationContext = {
  toolName: string;
  state: PetrinautAiToolPresentationState;
  input: unknown;
  output: unknown;
  error: string | undefined;
};

/** How a host presents one tool card. */
export type PetrinautAiToolPresentation = {
  title: string;
  detail?: string;
  tone?: PetrinautAiToolPresentationTone;
  items?: readonly string[];
};

/** Resolves a host tool card from its call. */
export type PetrinautAiToolPresentationResolver = (
  context: PetrinautAiToolPresentationContext,
) => PetrinautAiToolPresentation | undefined;

/** Brunch's chat configuration: its transport, tools, conversation and host-owned controls. */
export type PetrinautAiAssistant = {
  /** Selects the assistant's visual presentation. Defaults to "stock". */
  presentation?: PetrinautAiAssistantPresentation;
  /** Optional host controls alongside the assistant header. */
  headerActions?: ReactNode;
  /** Restrict header actions to this input mode. Omitted: both modes. */
  actionsInputMode?: PetrinautAiInputMode;
  /**
   * Host-owned content beside the AI transcript in the panel's tab bar.
   * Switching tabs keeps both bodies mounted and the composer/Voice controls
   * available. Omitted: the stock assistant has its unchanged single view.
   */
  additionalTab?: {
    label: string;
    content: ReactNode;
    /**
     * Opaque, stable identities for host activity represented by this tab.
     * `undefined` means history is not ready; the first defined collection is
     * baseline hydration and does not attract attention.
     */
    activityIdentities?: readonly (number | string)[];
  };
  /** Label for the transcript tab/header. Defaults to "AI". */
  primaryLabel?: string;
  /** Status shown while a turn is submitted or streaming. */
  workingLabel?: string;
  /** Resolve host tool cards from their identity, lifecycle and payload. */
  resolveToolPresentation?: PetrinautAiToolPresentationResolver;
  /** Whether the panel may clear this conversation. Defaults to true. */
  canClearMessages?: boolean;
  /** Optional host-owned identity; `useChat` generates one when omitted. */
  conversationId?: string;
  /**
   * Optional synchronous boundary around canonical mutations. Hosts can inspect
   * their bound document before/after `execute()` or refuse without executing.
   * The panel still owns output insertion, continuation, and cancellation.
   * Not called for read-only refusals, schema failures, title changes or
   * commands. The refusal check runs first, from `api.document.refusals`.
   * `execute()` runs the plugin's edit, which checks again: an edit refused
   * after that check, such as when the editor turned read-only meanwhile,
   * returns `applied: false` with the refusal and leaves the document
   * unchanged.
   */
  executeMutation?: PetrinautAiMutationExecutor;
  /**
   * Host-run tool calls whose results the host returns itself while the
   * response is still streaming. Omitted for Stock and legacy Flue modes.
   */
  inBandBrowserTools?: {
    has: (toolName: string) => boolean;
    /**
     * Run one call at its turn in same-document order. The host decides
     * whether it may start, calls `execute` at most once with the input to
     * run, and reports the resolved output or the failure itself. `signal`
     * aborts on Stop. Later calls wait until this promise settles, except
     * behind an experiment, which yields once it has captured its source.
     */
    run: (
      call: {
        toolCallId: string;
        toolName: string;
        input: unknown;
        signal: AbortSignal;
      },
      execute: (input: unknown) => Promise<unknown>,
    ) => Promise<void>;
  };
  /** Host-owned dynamic tools executed automatically against the mounted editor. */
  automaticTools?: readonly PetrinautAiAutomaticTool[];
  /**
   * The document handle the host bound this conversation to, which automatic
   * tools receive as `handle`. The plugin API does not expose the editor's
   * handle, so a host with automatic tools must supply it; without it they fail.
   */
  documentHandle?: PetrinautDocHandle;
  /** Host-owned dynamic tools that render inline in the AI conversation. */
  interactiveTools?: readonly PetrinautAiInteractiveTool[];
  messages?: PetrinautAiMessage[];
  /**
   * Pure presentation projection, for example host-owned voice captions.
   * Never changes transport input, tool execution, persisted history, or the
   * messages supplied to composer and Voice controls. Do not mutate the input.
   */
  mapMessagesForDisplay?: (
    messages: PetrinautAiMessage[],
  ) => PetrinautAiMessage[];
  /**
   * Render display-only system-note content; return undefined for the default
   * note. Only `presentation: "brunch"` shows system messages as notes.
   */
  renderSystemMessage?: (message: PetrinautAiMessage) => ReactNode;
  /**
   * Opt into following host history while locally idle. The predicate must
   * describe the exact snapshot supplied in `messages`, including settlement
   * of every local admission; message IDs alone cannot prove catch-up.
   * Observed tools are display-only, including after reload. Only tools from
   * this panel's own response stream may execute in this mode.
   * Omitted: messages retain their initial-hydration/recovery behavior.
   */
  followMessages?: { canReplace: () => boolean };
  onClearMessages?: () => void;
  onMessages?: (messages: PetrinautAiMessage[]) => void;
  /**
   * Requests a host-owned durable stop. When omitted, Stop only cancels the
   * panel's local response stream.
   */
  requestStop?: () => Promise<PetrinautAiStopResult>;
  /** Render a host-owned control inside the assistant composer. */
  renderComposerControl?: PetrinautAiComposerControl;
  /** Render host-owned status above the text composer or Voice dock. */
  renderComposerStatus?: PetrinautAiComposerControl;
  /** Render one persistent, provider-neutral Voice mode. */
  renderVoiceMode?: PetrinautAiVoiceMode;
  transport: PetrinautAiTransport;
};
