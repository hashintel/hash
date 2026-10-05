import "@fontsource-variable/inter";
import "@fontsource-variable/inter-tight";
import "@fontsource-variable/jetbrains-mono";
import "./index.css";
import { type FunctionComponent, useEffect, useMemo, useRef } from "react";

import { PortalContainerContext } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";
import {
  createPetrinaut,
  type PetrinautDocHandle,
  type Petrinaut as Instance,
  type LspWorkerFactory,
  type WorkerFactory,
  type MinimalNetMetadata,
  type SDCPN,
} from "@hashintel/petrinaut-core";

import {
  CommandRegistryProvider,
  useCommandRegistry,
} from "../react/commands/command-registry";
import { PetrinautProvider } from "../react/petrinaut-provider";
import { Stack } from "./components/stack";
import { MonacoProvider } from "./monaco/provider";
import {
  AiAssistantPropContext,
  aiAssistantPropPlugin,
} from "./plugins/ai-assistant-prop-plugin";
import { PetrinautPluginsProvider } from "./plugins/plugins-provider";
import { EditorView } from "./views/Editor/editor-view";
import {
  PetrinautPresentationProvider,
  type PetrinautPresentationProfile,
} from "./views/shared/presentation-context";

// `clip`, not `hidden`: a hidden-overflow box is still programmatically
// scrollable, and focusing an element the canvas transform pushed past the
// edge (a value editor opening) scrolled the whole app sideways with no
// way back. `clip` forbids all scrolling of the box.
const editorRootStyle = css({
  position: "relative",
  height: "full",
  overflow: "clip",
  backgroundColor: "neutral.s25",
});

import type {
  PetrinautAiComposerControl,
  PetrinautAiVoiceMode,
} from "./types/ai-assistant-composer-control";
import type { PetrinautAiAutomaticTool } from "./types/ai-automatic-tool";
import type { PetrinautAiInteractiveTool } from "./types/ai-interactive-tool";
import type {
  PetrinautAiMessage,
  PetrinautAiTransport,
} from "./views/Editor/panels/ai-assistant-panel";
import type { PetrinautAiMutationExecutor } from "./views/Editor/panels/ai-assistant-panel/types";

/** AI SDK `ChatTransport` that sends the conversation and streams the reply. */
export type PetrinautAiChatTransport = PetrinautAiTransport;

/**
 * What `requestStop` reports. `"stop-requested"`: Petrinaut also cancels the
 * local stream. `"already-settled"`: the response had already ended.
 */
export type PetrinautAiStopResult = "already-settled" | "stop-requested";

/**
 * Visual style of the chat: `"stock"` for Petrinaut's own, `"brunch"` for the
 * Brunch assistant's.
 */
export type PetrinautAiAssistantPresentation = "stock" | "brunch";

/**
 * Lifecycle of a tool call: `"pending"` until it has a result, then
 * `"success"`, or `"error"` when it failed.
 */
export type PetrinautAiToolPresentationState = "pending" | "success" | "error";

/** Color of a tool card in the transcript. */
export type PetrinautAiToolPresentationTone =
  | "danger"
  | "info"
  | "neutral"
  | "pending"
  | "success";

/** A tool call as `resolveToolPresentation` receives it. */
export type PetrinautAiToolPresentationContext = {
  /** Name of the tool the model called. */
  toolName: string;
  /** Where the call is in its lifecycle. */
  state: PetrinautAiToolPresentationState;
  /** Arguments from the model; partial while they are still streaming. */
  input: unknown;
  /** The tool's result; `undefined` until `state` is `"success"`. */
  output: unknown;
  /** Error text when `state` is `"error"`, otherwise `undefined`. */
  error: string | undefined;
};

/** How the transcript shows a tool call, in place of Petrinaut's card text. */
export type PetrinautAiToolPresentation = {
  /** Card title, in place of Petrinaut's summary. */
  title: string;
  /**
   * Text under the title; a failed call shows its error text instead.
   * Omitted: Petrinaut's own detail, unless `items` is set.
   */
  detail?: string;
  /** Card color. Omitted: Petrinaut picks one from the call's state and tool. */
  tone?: PetrinautAiToolPresentationTone;
  /** Lines listed on the card, in place of Petrinaut's own list. */
  items?: readonly string[];
};

/** Returns how to show a tool call, or `undefined` to keep Petrinaut's card. */
export type PetrinautAiToolPresentationResolver = (
  context: PetrinautAiToolPresentationContext,
) => PetrinautAiToolPresentation | undefined;

/**
 * An assistant's chat: transport, stored history, tools and transcript style.
 * A plugin returns it as `assistant.chat` from its body.
 */
export type PetrinautAiAssistant = {
  /** Visual style of the chat. Defaults to `"stock"`. */
  presentation?: PetrinautAiAssistantPresentation;
  /**
   * One tab beside the chat, read only from the `aiAssistant` prop. A plugin
   * returns `assistant.tabs` instead.
   */
  additionalTab?: {
    /** Text on the tab. */
    label: string;
    /** What the tab shows. It stays mounted while another tab is shown. */
    content: React.ReactNode;
    /**
     * Stable ids of the activity the tab lists; ids that appear while the tab is hidden badge it.
     * The first list is the baseline and showing the tab clears the badge; `undefined` until the activity is known.
     */
    activityIdentities?: readonly (number | string)[];
  };
  /** Label of the chat tab, or of the header without tabs. Defaults to `"AI"`. */
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
   * Wraps each document edit that Petrinaut's built-in AI tools make. Call `execute()`
   * at most once, before returning, or return a refusal without calling it.
   * Not called for commands, title changes, read-only refusals or invalid input.
   */
  executeMutation?: PetrinautAiMutationExecutor;
  /**
   * Tool calls this assistant runs itself while the response is still
   * streaming, reporting their results itself.
   */
  inBandBrowserTools?: {
    /** Whether this assistant runs the named tool itself. */
    has: (toolName: string) => boolean;
    /**
     * Runs one tool call, once the previous call settles; `signal` aborts on Stop.
     * Call `execute` at most once, with the input to run, to have Petrinaut run the tool.
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
  /** Tools Petrinaut runs for this assistant without user input, against the mounted editor. */
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

import type { PetrinautNavigationController } from "../react/navigation";
import type { NetManagement } from "../react/net-management-context";
import type { PetrinautPlugin } from "./plugins/define-petrinaut-plugin";
import type { PetrinautSlots } from "./types/petrinaut-slots";
import type { ViewportAction } from "./types/viewport-action";

/** Props of `<Petrinaut>`. */
export type PetrinautProps = {
  /** The document the editor shows and edits; a new handle starts a new editor instance. */
  handle: PetrinautDocHandle;
  /**
   * Plugins that add buttons, top-bar items, an assistant, settings and flags.
   * Pass each once. The first assistant provider is the default assistant,
   * unless `aiAssistant` is set.
   */
  plugins?: readonly PetrinautPlugin[];
  /** The net's title, shown in the top bar. Defaults to `"Untitled"`. */
  title?: string;
  /** Saves a new title, from the top bar or the AI assistant. Omitted: the title is read-only. */
  setTitle?: (title: string) => void;
  /** Shows the document without allowing edits. Defaults to `false`; a change starts a new editor instance. */
  readonly?: boolean;
  /**
   * Controls visibility of net-management UI in the editor's top bar and
   * burger menu.
   *
   * - [omitted] (default): show the title, include the "New", "Open", "Import",
   *   and "Load example" menu items in the burger menu.
   * - `"except-title"`: hide the management menu items but keep the title
   *   viewable and editable in the top bar.
   * - `"all"`: hide the title and all net-management menu items.
   */
  hideNetManagementControls?: "all" | "except-title";
  /** Nets listed under "Open" in the burger menu, which shows "Open" only when this is non-empty. */
  existingNets?: MinimalNetMetadata[];
  /** Called with a new net's definition and title from "New", "Import" or "Load example". */
  createNewNet?: (params: { petriNetDefinition: SDCPN; title: string }) => void;
  /** Called with the `netId` of the net the user picks under "Open". */
  loadPetriNet?: (petriNetId: string) => void;
  /**
   * One assistant passed as its chat configuration. Petrinaut runs it as an
   * assistant plugin placed before `plugins`, so it is the default assistant,
   * with `additionalTab` as its one tab.
   */
  aiAssistant?: PetrinautAiAssistant;
  viewportActions?: ViewportAction[];
  /**
   * Host-supplied components to inject at specific locations in the editor.
   */
  slots?: PetrinautSlots;
  /**
   * Optional simulation-worker factory, for a host bundler that must own worker
   * instantiation, as when consuming the published dist: typically via Vite's
   * `?worker` directive against your own copy of the worker entry. Omitted: the
   * bundled inlined-blob worker, which suits source builds but not always dist consumers.
   */
  simulationWorkerFactory?: WorkerFactory;
  /**
   * Optional Monte Carlo worker factory. Hosts can provide this when they need
   * to own worker bundling for the Experiments tab.
   */
  monteCarloWorkerFactory?: WorkerFactory;
  /**
   * Optional language-server worker factory, for the same reason as
   * `simulationWorkerFactory`: typically via `?worker` against the host's own
   * copy of the worker source.
   */
  lspWorkerFactory?: LspWorkerFactory;
  /** Optional host-controlled, router-neutral app location. */
  navigation?: PetrinautNavigationController;
  /**
   * Presentation policy for the full editor. `review` keeps the full editor
   * surface while suppressing authoring actions for route-scoped read-only
   * examples. The default remains `editor`.
   */
  presentationProfile?: Exclude<PetrinautPresentationProfile, "preview">;
};

const noop = () => {};
const noPlugins: readonly PetrinautPlugin[] = [];

/**
 * Handle-driven entry point. Creates a Core {@link Instance} from the given
 * handle, mounts {@link PetrinautProvider} to connect every bridge, and renders
 * the editor.
 *
 * Net-management concerns (title, switching) are passed alongside the handle
 * because they're not part of Core: they live in the host app.
 */
export const Petrinaut: FunctionComponent<PetrinautProps> = ({
  handle,
  plugins = noPlugins,
  title = "Untitled",
  setTitle,
  readonly = false,
  hideNetManagementControls,
  existingNets = [],
  createNewNet = noop,
  loadPetriNet = noop,
  aiAssistant,
  viewportActions,
  slots,
  simulationWorkerFactory,
  monteCarloWorkerFactory,
  lspWorkerFactory,
  navigation,
  presentationProfile = "editor",
}) => {
  const titleEditable = setTitle !== undefined;
  const portalContainerRef = useRef<HTMLDivElement>(null);
  const instance = useMemo<Instance>(
    () => createPetrinaut({ document: handle, readonly }),
    [handle, readonly],
  );

  useEffect(() => () => instance.dispose(), [instance]);

  const netManagement: NetManagement = {
    title,
    setTitle,
    existingNets,
    createNewNet,
    loadPetriNet,
  };
  // Commands register in the host's registry when it shares one, so a host
  // palette lists them; otherwise in one of the editor's own, which a plugin
  // palette lists.
  const ambientRegistry = useCommandRegistry();
  // The `aiAssistant` prop runs as the first assistant plugin, so it is the
  // default assistant; its configuration reaches the plugin through context.
  const hasAiAssistant = aiAssistant !== undefined;
  const editorPlugins = useMemo(
    () => (hasAiAssistant ? [aiAssistantPropPlugin, ...plugins] : plugins),
    [hasAiAssistant, plugins],
  );

  const editor = (
    <PortalContainerContext value={portalContainerRef}>
      <PetrinautProvider
        instance={instance}
        netManagement={netManagement}
        simulationWorkerFactory={simulationWorkerFactory}
        monteCarloWorkerFactory={monteCarloWorkerFactory}
        lspWorkerFactory={lspWorkerFactory}
        navigation={navigation}
      >
        <PetrinautPresentationProvider profile={presentationProfile}>
          <MonacoProvider>
            <Stack
              className={cx(editorRootStyle, "petrinaut-root")}
              ref={portalContainerRef}
            >
              {/* Plugins run under the document's providers, beside the
                  view: switching one off in User settings leaves the view,
                  the document, navigation and workers mounted. */}
              <AiAssistantPropContext value={aiAssistant}>
                <PetrinautPluginsProvider
                  plugins={editorPlugins}
                  document={{ id: handle.id, handle }}
                >
                  <EditorView
                    hideNetManagementControls={hideNetManagementControls}
                    slots={slots}
                    titleEditable={titleEditable}
                    viewportActions={viewportActions}
                  />
                </PetrinautPluginsProvider>
              </AiAssistantPropContext>
            </Stack>
          </MonacoProvider>
        </PetrinautPresentationProvider>
      </PetrinautProvider>
    </PortalContainerContext>
  );

  return ambientRegistry ? (
    editor
  ) : (
    <CommandRegistryProvider>{editor}</CommandRegistryProvider>
  );
};
