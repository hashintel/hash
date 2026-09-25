/**
 * @layerRoot website.local-storage-demo
 * @role Editable demo shell: nets in local storage, one live document handle
 */

import {
  createFlueClient,
  type FlueConversationSettlement,
  type FlueConversationState,
} from "@flue/sdk";
import {
  use,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  agentOwnershipHeaders,
  flueConversationIdWeb,
} from "@hashintel/brunch-agent-transport-aisdk";
import { brunchModes, brunchTools } from "@hashintel/brunch-agent/constants";
import {
  createJsonDocHandle,
  type DocumentRevisionId,
  type MinimalNetMetadata,
  type PetrinautDocHandle,
  type PetrinautHandleCapabilities,
  type SDCPN,
} from "@hashintel/petrinaut-core";
import {
  CommandRegistryProvider,
  ErrorTrackerContext,
  useCommand,
  UserSettingsProvider,
} from "@hashintel/petrinaut/react";
import {
  DefaultChatTransport,
  Petrinaut,
  type PetrinautAiMessage,
  type PetrinautAiStopResult,
  type PetrinautAiVoiceMode,
  type PetrinautAiVoiceModeContext,
  WalkthroughProvider,
} from "@hashintel/petrinaut/ui";

import {
  useSharedSearchNavigation,
  withClearedSharedLocation,
} from "../../../examples/use-shared-search-navigation";
import { VOICE_REQUEST_ID_HEADER } from "../../../voice-diagnostics";
import { CommandPalette } from "../command-palette";
import { useSentryFeedbackAction } from "../sentry-feedback-button";
import {
  loadOpenAIVoiceConfig,
  type OpenAIVoiceConfig,
  VoiceInterviewControl,
} from "../voice-interview/voice-interview-control";
import { AssistantLabsSettings } from "./assistant-labs-settings";
import {
  isBrunchSelected,
  stockChatEndpoint,
  type AssistantSelection,
  useAssistantSelection,
} from "./assistant-selection";
import {
  useProcessAgentBinding,
  type FixtureProcessAgentConfiguration,
  type ProcessAgentBinding,
} from "./assistants/brunch/use-process-agent-binding";
import {
  canonicalPetrinautClientToolNames,
  integratedPetrinautClientToolNames,
} from "./brunch-client-tools";
import {
  brunchEvaluationConversationIdFrom,
  ordinaryConstructionConversationIdFrom,
} from "./brunch-conversation-id";
import {
  createBrunchDraftExperimentInteractiveTool,
  resolveDraftAuthorityFromHistory,
} from "./brunch-draft-experiment-interactive-tool";
import {
  BrunchPanelConversationTracker,
  type BrunchPanelAdmissionTarget,
  createBrunchPanelTransport,
} from "./brunch-panel-transport";
import {
  createCanonicalPetrinautHostTools,
  issuedCanonicalCallsFromHistory,
  EMPTY_CANONICAL_PETRINAUT_REPLAY,
  type CanonicalPetrinautReplay,
  type CanonicalPetrinautReplayReadiness,
} from "./brunch-petrinaut-tools";
import { resolveBrunchPreviewConfig } from "./brunch-preview-config";
import { getOrCreateBrunchPrincipal } from "./brunch-principal";
import { resolveBrunchToolPresentation } from "./brunch-tool-presentation";
import { foldBrunchWorkpieceHistory } from "./brunch-workpiece-history";
import { BrunchWorkpiecePane } from "./brunch-workpiece-pane";
import { useDocumentController } from "./documents/use-document-controller";
import { createInBandBrowserCalls } from "./in-band-browser-call";
import { useFlueChatHistory } from "./use-flue-chat-history";
import { useLocalStorageAiMessages } from "./use-local-storage-ai-messages";
import { emptySDCPN } from "./use-local-storage-sdcpns";
import { useRealtimePreference, useVoicePreference } from "./voice-preference";
import { walkthroughSteps } from "./walkthrough/walkthrough-steps";

import type { SharedExampleSearch } from "../../../examples/example-search";
import type {
  DocumentRecord,
  DocumentRepository,
} from "./documents/document-repository";

const useCurrentSettlementAction = (
  settleRevision: DocumentRepository["settleRevision"],
): DocumentRepository["settleRevision"] => {
  const latest = useRef(settleRevision);
  useLayoutEffect(() => {
    latest.current = settleRevision;
  }, [settleRevision]);
  return useCallback((revision) => latest.current(revision), []);
};

const DEMO_CAPABILITIES = {
  disabledExtensions: [],
} satisfies PetrinautHandleCapabilities;

type ReplayReadiness<Replay> =
  | { readonly status: "pending" }
  | { readonly status: "ready"; readonly replay: Replay };

type ReplayBaseline<Snapshot, Replay> = {
  readonly key: string;
  readonly snapshot: Snapshot | undefined;
  readonly readiness: ReplayReadiness<Replay>;
};

/**
 * Captures the first authoritative history state for one mounted binding. An
 * absent history becomes an empty baseline during render; an existing history
 * is captured once and stays fail-closed until its asynchronous verification
 * completes. Later observation offsets cannot alter the ready baseline.
 */
const useImmutableReplayBaseline = <Snapshot, Replay>(input: {
  readonly bindingKey: string | undefined;
  readonly emptyReplay: Replay;
  readonly historyPhase: string | undefined;
  readonly snapshot: Snapshot | undefined;
  readonly derive: (snapshot: Snapshot) => Promise<Replay>;
}): ReplayReadiness<Replay> => {
  const [storedBaseline, setStoredBaseline] = useState<
    ReplayBaseline<Snapshot, Replay> | undefined
  >(undefined);
  let baseline = storedBaseline;

  if (input.bindingKey === undefined) {
    if (baseline !== undefined) setStoredBaseline(undefined);
    baseline = undefined;
  } else if (baseline === undefined || baseline.key !== input.bindingKey) {
    baseline = {
      key: input.bindingKey,
      snapshot: input.snapshot,
      readiness:
        input.historyPhase === "absent"
          ? { status: "ready", replay: input.emptyReplay }
          : { status: "pending" },
    };
    setStoredBaseline(baseline);
  } else if (
    baseline.readiness.status === "pending" &&
    baseline.snapshot === undefined &&
    (input.historyPhase === "absent" || input.snapshot !== undefined)
  ) {
    baseline = {
      ...baseline,
      snapshot: input.snapshot,
      readiness:
        input.historyPhase === "absent"
          ? { status: "ready", replay: input.emptyReplay }
          : baseline.readiness,
    };
    setStoredBaseline(baseline);
  }

  const derive = input.derive;
  useEffect(() => {
    const capturedSnapshot = baseline?.snapshot;
    if (
      baseline === undefined ||
      baseline.readiness.status === "ready" ||
      capturedSnapshot === undefined
    )
      return;
    let cancelled = false;
    const capturedBaseline = baseline;
    void derive(capturedSnapshot).then((replay) => {
      if (!cancelled) {
        setStoredBaseline((current) =>
          current === capturedBaseline
            ? {
                ...capturedBaseline,
                readiness: { status: "ready", replay },
              }
            : current,
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, [baseline, derive]);

  return baseline?.readiness ?? { status: "pending" };
};

const brunchPreviewConfig = resolveBrunchPreviewConfig(
  import.meta.env.VITE_BRUNCH_CHAT_ENDPOINT,
  (import.meta.env as unknown as Record<string, string | undefined>)[
    "VITE_BRUNCH_EVALUATION_MODE"
  ],
);

export const getBrunchVoiceMode = (
  config: OpenAIVoiceConfig | null | undefined,
  tracker?: BrunchPanelConversationTracker,
  settlements?: readonly FlueConversationSettlement[],
  snapshot?: FlueConversationState,
): PetrinautAiVoiceMode | undefined => {
  if (!config) return undefined;

  const resolveInputSubmission = tracker?.submissionForInput.bind(tracker);
  const resolveResponseSubmission =
    tracker?.submissionsForResponse.bind(tracker);
  const subscribeToResponseMessageCompleted =
    tracker?.subscribeToResponseMessageCompleted.bind(tracker);
  const subscribeToResponseMessageStarted =
    tracker?.subscribeToResponseMessageStarted.bind(tracker);
  const subscribeToStopRequested =
    tracker?.subscribeToStopRequested.bind(tracker);
  const subscribeToAdmission =
    tracker === undefined
      ? undefined
      : (target: BrunchPanelAdmissionTarget, listener: (id: string) => void) =>
          tracker.subscribeToAdmission(target, ({ admission }) =>
            listener(admission.submissionId),
          );
  const subscribeToAdmissionFailure =
    tracker?.subscribeToAdmissionFailure.bind(tracker);

  return (context: PetrinautAiVoiceModeContext) => (
    <VoiceInterviewControl
      {...context}
      config={config}
      settlements={settlements}
      // Voice only observes this snapshot. Message replacement remains gated
      // independently by followMessages.canReplace below.
      snapshot={snapshot}
      resolveInputSubmission={resolveInputSubmission}
      resolveResponseSubmission={resolveResponseSubmission}
      subscribeToResponseMessageCompleted={subscribeToResponseMessageCompleted}
      subscribeToResponseMessageStarted={subscribeToResponseMessageStarted}
      subscribeToStopRequested={subscribeToStopRequested}
      subscribeToAdmission={subscribeToAdmission}
      subscribeToAdmissionFailure={subscribeToAdmissionFailure}
    />
  );
};

const createHandle = (document: DocumentRecord): PetrinautDocHandle =>
  createJsonDocHandle({
    id: document.documentId,
    initial: document.definition,
    initialRevisionId: document.revisionId,
    capabilities: DEMO_CAPABILITIES,
  });

const brunchPrincipal = getOrCreateBrunchPrincipal();

// The stock assistant's transport is the same whether or not Brunch is
// configured: selecting the stock assistant must not route it through Brunch.
const stockChatTransport = new DefaultChatTransport({
  api: stockChatEndpoint,
  headers: () => ({
    [VOICE_REQUEST_ID_HEADER]: crypto.randomUUID(),
  }),
});

const createBrunchFlueClient = async (conversationId: string) => {
  const identity = { conversationId, principalKey: brunchPrincipal };
  const instanceId = await flueConversationIdWeb(identity);
  const mountUrl = new URL(
    brunchPreviewConfig.chatEndpoint,
    window.location.origin,
  );
  mountUrl.pathname = `${mountUrl.pathname.replace(/\/+$/u, "")}/${instanceId}`;
  return createFlueClient({
    url: mountUrl.href,
    headers: () => agentOwnershipHeaders(identity),
  });
};

/**
 * Flue's `abort()` is conversation-wide and only reaches unsettled work, so a
 * Stop pressed while `send()` is still in flight must first let that admission
 * land; otherwise `aborted: false` would read as "already settled" while the
 * admitted turn keeps running.
 */
export const requestFlueStop = async (
  clientPromise: Promise<ReturnType<typeof createFlueClient>>,
  tracker: BrunchPanelConversationTracker,
): Promise<PetrinautAiStopResult> => {
  tracker.recordStopRequested();
  const client = await clientPromise;
  await tracker.settleInFlightSubmissions();
  const result = await client.abort();
  return result.aborted ? "stop-requested" : "already-settled";
};

const createConversationTrackerFor = (
  _conversationId: string | null,
): BrunchPanelConversationTracker => new BrunchPanelConversationTracker();

type ActiveHandle = {
  handle: PetrinautDocHandle;
  document: DocumentRecord;
  /**
   * Every revision this handle has produced (plus the one it opened at). A
   * repository revision outside this set was written by someone else — another
   * tab, typically — and the handle must be recreated from it rather than keep
   * chaining edits from a predecessor the repository no longer holds.
   */
  emittedRevisionIds: Set<DocumentRevisionId>;
};

type PersistFailure = {
  /** The handle whose change was refused; it is replaced, not kept. */
  handle: PetrinautDocHandle;
  documentId: DocumentRecord["documentId"];
  incarnationId: DocumentRecord["incarnationId"];
  error: Error;
};

const useProcessAgentSession = (input: {
  readonly binding: ProcessAgentBinding | null;
  readonly brunchSelected: boolean;
}) => {
  return useMemo(() => {
    const conversationTracker = createConversationTrackerFor(
      input.binding?.conversationId ?? null,
    );
    const flueClientPromise =
      input.brunchSelected && input.binding !== null
        ? createBrunchFlueClient(input.binding.conversationId)
        : null;
    return { conversationTracker, flueClientPromise };
  }, [input.binding, input.brunchSelected]);
};

const createActiveHandle = (document: DocumentRecord): ActiveHandle => {
  const handle = createHandle(document);
  return {
    handle,
    document,
    emittedRevisionIds: new Set([document.revisionId]),
  };
};

/**
 * The demo's own palette commands, registered beside Petrinaut's.
 * Evaluation modes are build-time-only and deliberately have no product UI.
 */
const DemoCommands = ({
  createNewNet,
  brunchSelected,
  selectAssistant,
}: {
  createNewNet: (params: { petriNetDefinition: SDCPN; title: string }) => void;
  brunchSelected: boolean;
  selectAssistant: (selection: "brunch" | "stock") => void;
}) => {
  useCommand({
    id: "demo.net.new",
    label: "Create a new empty net",
    category: "Demo",
    keywords: ["file"],
    run: () =>
      createNewNet({ petriNetDefinition: emptySDCPN, title: "New Process" }),
  });
  useCommand(
    {
      id: "demo.assistant.switch",
      label: brunchSelected
        ? "Use the stock Petrinaut assistant"
        : "Use Brunch",
      category: "Demo",
      keywords: ["assistant", "brunch", "stock", "ai"],
      run: () => selectAssistant(brunchSelected ? "stock" : "brunch"),
    },
    { when: brunchPreviewConfig.isBrunchConfigured },
  );
  return null;
};

/**
 * Local-storage demo shell for Petrinaut.
 *
 * Local storage is the persistence layer for saved nets, while the active
 * Petrinaut document handle owns the currently open net's live editable state.
 * Switching files replaces the active handle instead of keeping handles alive
 * for background nets.
 */
export const LocalStorageDemoApp = ({
  onSearchChange,
  search,
}: {
  onSearchChange: (
    search: SharedExampleSearch,
    history: "push" | "replace",
  ) => void;
  search: SharedExampleSearch;
}) => {
  const sentryFeedbackAction = useSentryFeedbackAction();
  // Stock-vs-Brunch remains the native product choice. F/I/A/B only select
  // the internal composition of Brunch and are never exposed in product UI.
  const {
    ready: assistantSelectionReady,
    selection: assistantSelection,
    setSelection: setAssistantSelection,
  } = useAssistantSelection();
  const {
    enabled: voiceEnabled,
    ready: voicePreferenceReady,
    setEnabled: setVoiceEnabled,
  } = useVoicePreference();
  const {
    enabled: realtimeEnabled,
    ready: realtimePreferenceReady,
    setEnabled: setRealtimeEnabled,
  } = useRealtimePreference();
  const brunchSelected =
    assistantSelectionReady &&
    isBrunchSelected(
      brunchPreviewConfig.isBrunchConfigured,
      assistantSelection,
    );
  const integratedBrunchSelected =
    brunchSelected && brunchPreviewConfig.evaluationMode !== "F";
  const [openAIVoiceConfig, setOpenAIVoiceConfig] = useState<
    OpenAIVoiceConfig | null | undefined
  >(undefined);
  const selectAssistant = (selection: AssistantSelection) => {
    setOpenAIVoiceConfig(selection === "brunch" ? undefined : null);
    setAssistantSelection(selection);
    if (selection === "brunch") setVoiceEnabled(true);
  };
  /**
   * History is left to the library's default on purpose. That default already
   * replaces rather than pushes while an intent continues, so a drag-select
   * records one entry instead of one per intermediate selection, and a discrete
   * click is the only thing that pushes. Making selections replace as well
   * removed every entry this page can produce, which left the first Back press
   * leaving the site instead of retracing the net.
   */
  const navigation = useSharedSearchNavigation(search, onSearchChange);

  /**
   * The location belongs to the net that was open. Petrinaut resets its own
   * location per document by keying on the handle id, but that only resets an
   * uncontrolled location, so the host clears this one.
   *
   * Cleared through the controller rather than by writing an empty search: the
   * shared projection is lossy, so a location the URL already renders as empty
   * leaves the search prop unchanged and the in-memory selection would survive
   * into the next net.
   */
  const clearSharedLocation = useCallback(() => {
    navigation.onNavigate(withClearedSharedLocation, {
      history: "replace",
      intent: { cause: "normalization", action: "selection" },
    });
  }, [navigation]);
  const { aiMessagesByNetId, setAiMessagesByNetId } =
    useLocalStorageAiMessages();
  const productConstructionSelected = integratedBrunchSelected;
  const { controller } = useDocumentController({
    onOpenDocument: clearSharedLocation,
  });
  const { repository } = controller;
  const currentDocument = repository.current;
  const currentNetId = currentDocument?.documentId ?? null;

  useEffect(() => {
    if (!brunchSelected) {
      return;
    }

    const abortController = new AbortController();
    // eslint-disable-next-line react-hooks-js/set-state-in-effect -- reset stale capability before a newly selected Brunch session checks Voice
    setOpenAIVoiceConfig(undefined);
    void loadOpenAIVoiceConfig(
      globalThis.fetch.bind(globalThis),
      abortController.signal,
    ).then((config) => {
      if (!abortController.signal.aborted) {
        setOpenAIVoiceConfig(config);
      }
    });

    return () => abortController.abort();
  }, [brunchSelected]);

  // Live editable document handle for the selected net only.
  const [activeHandle, setActiveHandle] = useState<ActiveHandle | null>(null);
  // The most recent change the repository refused to persist, if any. It is
  // about the open document: cleared once a later change to that document
  // lands, or when another document is opened in its place.
  const [persistFailure, setPersistFailure] = useState<PersistFailure | null>(
    null,
  );

  // The handle follows the repository: it is recreated from the repository's
  // record whenever the two diverge — the record shows a revision this handle
  // never emitted (another tab wrote it), or the repository refused one of
  // this handle's changes, after which every further change from it would be
  // refused too, because each names the rejected revision as predecessor.
  useEffect(() => {
    if (currentDocument === null) {
      // eslint-disable-next-line react-hooks-js/set-state-in-effect -- repository selection synchronizes the selected document handle
      setActiveHandle(null);
      return;
    }
    setActiveHandle((previous) =>
      previous?.document.documentId === currentDocument.documentId &&
      previous.document.incarnationId === currentDocument.incarnationId &&
      previous.emittedRevisionIds.has(currentDocument.revisionId) &&
      persistFailure?.handle !== previous.handle
        ? previous
        : createActiveHandle(currentDocument),
    );
    setPersistFailure((failure) =>
      failure !== null &&
      (failure.documentId !== currentDocument.documentId ||
        failure.incarnationId !== currentDocument.incarnationId)
        ? null
        : failure,
    );
  }, [currentDocument, persistFailure]);

  useEffect(() => {
    if (!activeHandle) {
      return;
    }

    const { document, emittedRevisionIds, handle } = activeHandle;
    return handle.subscribe((event) => {
      emittedRevisionIds.add(event.revisionId);
      repository
        .persistRevision({
          documentId: document.documentId,
          incarnationId: document.incarnationId,
          definition: event.next,
          previousRevisionId: event.previousRevisionId,
          revisionId: event.revisionId,
        })
        .then(
          () =>
            setPersistFailure((failure) =>
              failure?.documentId === document.documentId &&
              failure.incarnationId === document.incarnationId
                ? null
                : failure,
            ),
          (error: unknown) =>
            setPersistFailure({
              handle,
              documentId: document.documentId,
              incarnationId: document.incarnationId,
              error: error instanceof Error ? error : new Error(String(error)),
            }),
        );
    });
  }, [activeHandle, repository]);
  const unsavedChangeMessage =
    persistFailure !== null &&
    persistFailure.documentId === currentDocument?.documentId &&
    persistFailure.incarnationId === currentDocument.incarnationId
      ? persistFailure.error.message
      : null;

  const existingNets: MinimalNetMetadata[] = repository.records
    .map((document) => ({
      netId: document.documentId,
      title: document.title,
      lastUpdated: document.lastUpdated ?? new Date(0).toISOString(),
    }))
    .toSorted(
      (left, right) =>
        new Date(right.lastUpdated).getTime() -
        new Date(left.lastUpdated).getTime(),
    );

  const createNewNet = (params: { petriNetDefinition: SDCPN; title: string }) =>
    controller.createAndOpen({
      definition: params.petriNetDefinition,
      title: params.title,
    });

  const loadPetriNet = (petriNetId: string) => {
    repository.open(petriNetId);
  };

  const renameCurrentDocument = repository.actions.rename;
  const setTitle =
    currentDocument === null
      ? undefined
      : (title: string) =>
          renameCurrentDocument({
            documentId: currentDocument.documentId,
            title,
          });
  const baseConstructionConversationId =
    currentDocument === null || !brunchSelected
      ? undefined
      : ordinaryConstructionConversationIdFrom(currentDocument.incarnationId);
  const fixtureProcessAgentConfiguration = useMemo<
    FixtureProcessAgentConfiguration | undefined
  >(
    () =>
      baseConstructionConversationId === undefined
        ? undefined
        : { conversationId: baseConstructionConversationId },
    [baseConstructionConversationId],
  );
  const baseProcessAgentBinding = useProcessAgentBinding({
    document: currentDocument,
    fixture: fixtureProcessAgentConfiguration,
  });
  const processAgentBinding = useMemo(
    () =>
      baseProcessAgentBinding === null
        ? null
        : {
            ...baseProcessAgentBinding,
            conversationId: brunchEvaluationConversationIdFrom(
              baseProcessAgentBinding.conversationId,
              brunchPreviewConfig.evaluationMode,
            ),
          },
    [baseProcessAgentBinding],
  );
  const conversationId = processAgentBinding?.conversationId ?? null;
  const processAgentSession = useProcessAgentSession({
    binding: processAgentBinding,
    brunchSelected,
  });
  const { conversationTracker, flueClientPromise } = processAgentSession;
  // Failures the host contains — a stopped batch operation, an unrecordable
  // transition, a lost history observation, a failed server tool — resolve
  // normally for the panel and the model; this is where they become visible.
  const { captureException } = use(ErrorTrackerContext);
  const reportBrunchFailure = useCallback(
    (
      failureSource: string,
      error: unknown,
      tags?: Readonly<Record<string, string | number | boolean>>,
    ) =>
      captureException(error, {
        source: `brunch.${failureSource}`,
        ...(tags === undefined ? {} : { tags }),
      }),
    [captureException],
  );
  const constructionBrowser = useMemo(() => {
    if (
      !activeHandle ||
      processAgentBinding === null ||
      activeHandle.document.documentId !== processAgentBinding.documentId ||
      activeHandle.document.incarnationId !== processAgentBinding.incarnationId
    )
      return undefined;
    return brunchSelected ? { binding: processAgentBinding } : undefined;
  }, [activeHandle, brunchSelected, processAgentBinding]);
  const integratedConstructionBrowser = productConstructionSelected
    ? constructionBrowser
    : undefined;
  const dynamicClientToolNames = useMemo(() => {
    if (integratedConstructionBrowser === undefined) return undefined;
    const names = new Set([
      "getLatestNetDefinition",
      "getNetCompilationErrors",
      "addPlace",
      "addTransition",
      "addArc",
    ]);
    names.add(brunchTools.draftPetrinautExperiment);
    if (brunchPreviewConfig.serverMode === brunchModes.integrated)
      for (const toolName of canonicalPetrinautClientToolNames)
        names.add(toolName);
    return names;
  }, [integratedConstructionBrowser]);
  const constructionClientTools = brunchSelected
    ? integratedBrunchSelected
      ? integratedPetrinautClientToolNames
      : canonicalPetrinautClientToolNames
    : undefined;
  const flueHistory = useFlueChatHistory(
    flueClientPromise,
    conversationId ?? "",
    constructionClientTools,
    dynamicClientToolNames,
    undefined,
    brunchPreviewConfig.serverMode === brunchModes.integrated
      ? canonicalPetrinautClientToolNames
      : undefined,
  );
  const replayBindingKey = integratedConstructionBrowser
    ? `${integratedConstructionBrowser.binding.documentId}:${integratedConstructionBrowser.binding.incarnationId}:${integratedConstructionBrowser.binding.conversationId}`
    : undefined;
  const deriveCanonicalReplay = useCallback(
    async (snapshot: NonNullable<typeof flueHistory.snapshot>) => {
      if (integratedConstructionBrowser === undefined)
        return EMPTY_CANONICAL_PETRINAUT_REPLAY;
      return issuedCanonicalCallsFromHistory({ snapshot });
    },
    [integratedConstructionBrowser],
  );
  const canonicalReplayReadiness = useImmutableReplayBaseline<
    NonNullable<typeof flueHistory.snapshot>,
    CanonicalPetrinautReplay
  >({
    bindingKey: replayBindingKey,
    emptyReplay: EMPTY_CANONICAL_PETRINAUT_REPLAY,
    historyPhase: flueHistory.phase,
    snapshot: flueHistory.snapshot,
    derive: deriveCanonicalReplay,
  }) satisfies CanonicalPetrinautReplayReadiness;
  // A persisted revision can change the repository action's identity while a
  // canonical tool is still settling. Keep the host adapter's evidence store
  // alive, but dispatch settlement through the latest committed action.
  const settleConstructionRevision = useCurrentSettlementAction(
    // eslint-disable-next-line typescript/unbound-method -- repository actions do not use `this`
    repository.settleRevision,
  );
  const canonicalHostTools = useMemo(() => {
    if (!integratedConstructionBrowser || !activeHandle) return undefined;
    return createCanonicalPetrinautHostTools({
      handle: activeHandle.handle,
      binding: integratedConstructionBrowser.binding,
      readTitle: () => activeHandle.document.title,
      replayReadiness: canonicalReplayReadiness,
      settleRevision: settleConstructionRevision,
    });
  }, [
    activeHandle,
    canonicalReplayReadiness,
    integratedConstructionBrowser,
    settleConstructionRevision,
  ]);
  useEffect(() => {
    if (flueHistory.error === undefined) return;
    reportBrunchFailure("history", flueHistory.error, {
      phase: flueHistory.phase ?? "unknown",
    });
  }, [flueHistory.error, flueHistory.phase, reportBrunchFailure]);
  const brunchVoiceMode = useMemo(
    () =>
      getBrunchVoiceMode(
        brunchSelected &&
          voicePreferenceReady &&
          voiceEnabled &&
          realtimePreferenceReady &&
          openAIVoiceConfig
          ? {
              ...openAIVoiceConfig,
              provider: realtimeEnabled ? "realtime" : "live",
            }
          : null,
        conversationTracker,
        flueHistory.settlements,
        flueHistory.snapshot,
      ),
    [
      brunchSelected,
      conversationTracker,
      flueHistory.settlements,
      flueHistory.snapshot,
      openAIVoiceConfig,
      realtimeEnabled,
      realtimePreferenceReady,
      voiceEnabled,
      voicePreferenceReady,
    ],
  );
  const transportClientPromise = flueClientPromise;
  const petrinautAiChatTransport = useMemo(() => {
    if (transportClientPromise !== null) {
      return createBrunchPanelTransport(
        transportClientPromise,
        conversationTracker,
        {
          initialData: {
            mode: brunchPreviewConfig.serverMode,
            ...(constructionBrowser
              ? { construction: { binding: constructionBrowser.binding } }
              : {}),
          },
          ...(transportClientPromise === flueClientPromise &&
          conversationId !== null
            ? {
                liveToolStream: {
                  headers: agentOwnershipHeaders({
                    conversationId,
                    principalKey: brunchPrincipal,
                  }),
                },
              }
            : {}),
          ...(constructionClientTools === undefined
            ? {}
            : {
                clientToolNames: constructionClientTools,
                ...(brunchPreviewConfig.serverMode === brunchModes.integrated
                  ? { asyncClientToolNames: canonicalPetrinautClientToolNames }
                  : {}),
                dynamicClientToolNames,
                ...(canonicalHostTools === undefined
                  ? {}
                  : {
                      mapClientToolInput: (call) =>
                        brunchPreviewConfig.serverMode ===
                        brunchModes.integrated
                          ? call.input
                          : (canonicalHostTools.mapClientToolInput(call) ??
                            call.input),
                    }),
              }),
          onAdmission: flueHistory.refresh,
          onToolOutputError: (event) =>
            reportBrunchFailure("server-tool", new Error(event.errorText), {
              submissionId: event.submissionId,
              toolCallId: event.toolCallId,
              toolName: event.toolName ?? "unknown",
            }),
        },
      );
    }
    return stockChatTransport;
  }, [
    conversationTracker,
    conversationId,
    constructionClientTools,
    constructionBrowser,
    canonicalHostTools,
    dynamicClientToolNames,
    flueClientPromise,
    flueHistory.refresh,
    reportBrunchFailure,
    transportClientPromise,
  ]);

  const inBandBrowserTools = useMemo(
    () =>
      brunchPreviewConfig.serverMode === brunchModes.integrated &&
      integratedConstructionBrowser &&
      flueClientPromise
        ? createInBandBrowserCalls({
            client: flueClientPromise,
            principalKey: brunchPrincipal,
            binding: integratedConstructionBrowser.binding,
            metadataFor: async (toolCallId, output) =>
              canonicalHostTools?.clientToolResultMetadataFor(
                toolCallId,
                output,
              ),
            prepareInput: (call) => {
              canonicalHostTools?.mapClientToolInput(call);
            },
          })
        : undefined,
    [integratedConstructionBrowser, flueClientPromise, canonicalHostTools],
  );

  const draftInteractiveTool = useMemo(
    () =>
      integratedConstructionBrowser && activeHandle && flueClientPromise
        ? createBrunchDraftExperimentInteractiveTool({
            readTitle: () => activeHandle.document.title,
            readDraftAuthority: async (toolCallId) => {
              const client = await flueClientPromise;
              return resolveDraftAuthorityFromHistory(
                await client.history(),
                integratedConstructionBrowser.binding,
                toolCallId,
              );
            },
          })
        : undefined,
    [activeHandle, flueClientPromise, integratedConstructionBrowser],
  );
  const aiAssistant = useMemo(() => {
    const activityIdentities =
      integratedConstructionBrowser && flueHistory.ready
        ? flueHistory.phase === "absent"
          ? []
          : flueHistory.snapshot === undefined
            ? undefined
            : foldBrunchWorkpieceHistory(
                flueHistory.snapshot.messages,
                integratedConstructionBrowser.binding,
              ).activityIdentities
        : undefined;
    return {
      additionalTab: integratedConstructionBrowser
        ? {
            label: "Ledger",
            activityIdentities,
            content: (
              <BrunchWorkpiecePane
                messages={flueHistory.snapshot?.messages ?? []}
                binding={integratedConstructionBrowser.binding}
              />
            ),
          }
        : undefined,
      ...(brunchSelected
        ? {
            primaryLabel: "Chat",
            resolveToolPresentation: resolveBrunchToolPresentation,
            workingLabel: "Brunch is working",
          }
        : {}),
      ...(conversationId === null ? {} : { conversationId }),
      canClearMessages: flueClientPromise === null,
      // These exact-name tools override the static registry only in integrated
      // modes. Every other canonical capability remains on Petrinaut's registry.
      inBandBrowserTools,
      automaticTools: [...(canonicalHostTools?.tools ?? [])],
      interactiveTools: draftInteractiveTool ? [draftInteractiveTool] : [],
      transport: petrinautAiChatTransport,
      ...(flueClientPromise === null
        ? {}
        : {
            requestStop: () =>
              requestFlueStop(flueClientPromise, conversationTracker),
            followMessages: {
              // This closure and `messages` below describe the same observed
              // snapshot, never a later mutable settlement cache.
              canReplace: () =>
                conversationTracker.canReplaceMessages(flueHistory.snapshot),
            },
          }),
      messages:
        flueClientPromise === null
          ? currentNetId
            ? aiMessagesByNetId[currentNetId]
            : undefined
          : flueHistory.messages,
      onMessages: (messages: PetrinautAiMessage[]) => {
        if (!currentNetId || flueClientPromise !== null) {
          return;
        }

        setAiMessagesByNetId((prev) => ({
          ...prev,
          [currentNetId]: messages,
        }));
      },
      onClearMessages: () => {
        if (!currentNetId || flueClientPromise !== null) {
          return;
        }

        setAiMessagesByNetId((prev) => {
          const next = { ...prev };
          delete next[currentNetId];
          return next;
        });
      },
      ...(brunchVoiceMode
        ? {
            renderVoiceMode: brunchVoiceMode,
          }
        : {}),
    };
  }, [
    aiMessagesByNetId,
    brunchSelected,
    brunchVoiceMode,
    canonicalHostTools,
    inBandBrowserTools,
    draftInteractiveTool,
    integratedConstructionBrowser,
    conversationTracker,
    conversationId,
    currentNetId,
    flueClientPromise,
    flueHistory.messages,
    flueHistory.phase,
    flueHistory.ready,
    flueHistory.snapshot,
    petrinautAiChatTransport,
    setAiMessagesByNetId,
  ]);

  if (
    repository.status.state === "loading" ||
    currentDocument === null ||
    !activeHandle ||
    activeHandle.document.documentId !== currentDocument.documentId
  ) {
    return <p>Loading document…</p>;
  }

  return (
    <div
      style={{
        height: "100vh",
        position: "relative",
        width: "100vw",
      }}
    >
      {unsavedChangeMessage !== null ? (
        // Host notices are centred below Petrinaut's 64px top bar and stacked
        // above its side panels (z-index 1097) and bar (1100), so neither can
        // hide them.
        <div
          style={{
            alignItems: "center",
            display: "flex",
            flexDirection: "column",
            fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
            fontSize: 14,
            gap: 8,
            left: "50%",
            maxWidth: "calc(100vw - 32px)",
            pointerEvents: "none",
            position: "fixed",
            top: 80,
            transform: "translateX(-50%)",
            zIndex: 1200,
          }}
        >
          <p
            role="alert"
            style={{
              background: "#fff1f0",
              border: "1px solid #ffa39e",
              borderRadius: 8,
              boxShadow: "0 2px 8px rgba(20, 33, 50, 0.12)",
              color: "#a8071a",
              margin: 0,
              padding: "10px 12px",
            }}
          >
            Changes not saved: {unsavedChangeMessage} The editor shows the last
            saved version.
          </p>
        </div>
      ) : null}
      {/* The settings are mounted here, above the editor, so the demo's own
          command and selector read the same persisted state the editor does. */}
      <UserSettingsProvider>
        <CommandRegistryProvider>
          <WalkthroughProvider steps={walkthroughSteps}>
            <Petrinaut
              aiAssistant={aiAssistant}
              handle={activeHandle.handle}
              existingNets={existingNets}
              createNewNet={createNewNet}
              loadPetriNet={loadPetriNet}
              navigation={navigation}
              readonly={false}
              setTitle={setTitle}
              slots={{
                settingsLabs: (
                  <AssistantLabsSettings
                    assistantReady={assistantSelectionReady}
                    brunchConfigured={brunchPreviewConfig.isBrunchConfigured}
                    brunchSelected={brunchSelected}
                    openAIVoiceConfig={openAIVoiceConfig}
                    realtimeEnabled={realtimeEnabled}
                    realtimePreferenceReady={realtimePreferenceReady}
                    selectAssistant={selectAssistant}
                    setRealtimeEnabled={setRealtimeEnabled}
                    setVoiceEnabled={setVoiceEnabled}
                    voiceEnabled={brunchSelected && voiceEnabled}
                    voicePreferenceReady={voicePreferenceReady}
                  />
                ),
              }}
              title={currentDocument.title}
              viewportActions={[sentryFeedbackAction]}
            />
          </WalkthroughProvider>
          <DemoCommands
            createNewNet={createNewNet}
            brunchSelected={brunchSelected}
            selectAssistant={selectAssistant}
          />
          <CommandPalette />
        </CommandRegistryProvider>
      </UserSettingsProvider>
    </div>
  );
};
