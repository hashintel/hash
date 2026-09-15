/**
 * @layerRoot website.local-storage-demo
 * @role Editable demo shell: nets in local storage, one live document handle
 */

import { createFlueClient, type FlueConversationSettlement } from "@flue/sdk";
import {
  use,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

import {
  batchedConstructionMode,
  conversationConstructionMode,
} from "@hashintel/brunch-agent-plugin-sdcpn";
import {
  agentOwnershipHeaders,
  flueConversationIdWeb,
} from "@hashintel/brunch-agent-transport-aisdk";
import { BRUNCH_DOCUMENT_REVISION_HEADER } from "@hashintel/brunch-agent-transport-aisdk/headers";
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
  UserSettingsContext,
  UserSettingsProvider,
} from "@hashintel/petrinaut/react";
import {
  DefaultChatTransport,
  Petrinaut,
  type PetrinautAiMessage,
  type PetrinautAiStopResult,
  type PetrinautAiToolStateLabels,
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
import {
  isBrunchSelected,
  stockChatEndpoint,
  useAssistantSelection,
} from "./assistant-selection";
import {
  useProcessAgentBinding,
  type FixtureProcessAgentConfiguration,
  type ProcessAgentBinding,
} from "./assistants/brunch/use-process-agent-binding";
import {
  batchedConstructionClientToolNames,
  brunchPetrinautDynamicToolNames,
  constructionClientToolNames,
} from "./brunch-client-tools";
import { ordinaryConstructionConversationIdFrom } from "./brunch-conversation-id";
import {
  BrunchPanelConversationTracker,
  type BrunchPanelAdmissionTarget,
  createBrunchPanelTransport,
  createUnavailableBrunchPanelTransport,
} from "./brunch-panel-transport";
import { createBrunchPetrinautTools } from "./brunch-petrinaut-tools";
import { resolveBrunchPreviewConfig } from "./brunch-preview-config";
import { getOrCreateBrunchPrincipal } from "./brunch-principal";
import { foldBrunchWorkpieceHistory } from "./brunch-workpiece-history";
import { BrunchWorkpiecePane } from "./brunch-workpiece-pane";
import { useDocumentController } from "./documents/use-document-controller";
import {
  isCrewReservationFixtureSelected,
  isRootArcTracerSelected,
  isConstructionSelected,
  localStorageDemoRouteIdentity,
} from "./local-storage-demo-search";
import {
  createJoinedBrowserMutationRecorder,
  observeBrowserDefinition,
} from "./mutation-record";
import { crewReservationDocumentId } from "./prepared-crew-reservation-fixture";
import {
  PreparedFixtureBanner,
  PreparedFixtureSelector,
  RootArcTracerBanner,
} from "./prepared-fixture-banner";
import {
  crewReservationFixtureConfiguration,
  useCrewReservationFixtureSession,
} from "./use-crew-reservation-fixture-session";
import { useFlueChatHistory } from "./use-flue-chat-history";
import { useLocalStorageAiMessages } from "./use-local-storage-ai-messages";
import { emptySDCPN } from "./use-local-storage-sdcpns";
import {
  selectCrewReservationPreparationBrowser,
  usePrepareCrewReservationConversation,
} from "./use-prepare-crew-reservation-conversation";
import { walkthroughSteps } from "./walkthrough/walkthrough-steps";

import type { DocumentRecord } from "./documents/document-repository";
import type { LocalStorageDemoSearch } from "./local-storage-demo-search";

const DEMO_CAPABILITIES = {
  disabledExtensions: [],
} satisfies PetrinautHandleCapabilities;

const brunchPreviewConfig = resolveBrunchPreviewConfig(
  import.meta.env.VITE_BRUNCH_CHAT_ENDPOINT,
);

const brunchToolStateLabels = {
  mutate_workpiece: {
    pending: "Updating ledger",
    success: "Updated ledger",
    error: "Could not update ledger",
  },
  read_workpiece: {
    pending: "Reading ledger",
    success: "Read ledger",
    error: "Could not read ledger",
  },
  query_workpiece: {
    pending: "Checking recorded basis",
    success: "Checked recorded basis",
    error: "Could not check recorded basis",
  },
  read_petrinaut_docs: {
    pending: "Reading Petrinaut guidance",
    success: "Read Petrinaut guidance",
    error: "Could not read Petrinaut guidance",
  },
  read_petrinaut_net: {
    pending: "Reading current model",
    success: "Read current model",
    error: "Could not read current model",
  },
  read_petrinaut_diagnostics: {
    pending: "Checking model diagnostics",
    success: "Checked model diagnostics",
    error: "Could not check model diagnostics",
  },
  layout_petrinaut_net: {
    pending: "Laying out model",
    success: "Laid out model",
    error: "Could not lay out model",
  },
  mutate_petrinaut_net: {
    pending: "Updating model",
    success: "Updated model",
    error: "Could not update model",
  },
} satisfies PetrinautAiToolStateLabels;

export const getBrunchVoiceMode = (
  config: OpenAIVoiceConfig | null | undefined,
  tracker?: BrunchPanelConversationTracker,
  settlements?: readonly FlueConversationSettlement[],
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

const createBrunchFlueClient = async (
  conversationId: string,
  currentRevisionId: () => string | undefined,
) => {
  const identity = { conversationId, principalKey: brunchPrincipal };
  const instanceId = await flueConversationIdWeb(identity);
  const mountUrl = new URL(
    brunchPreviewConfig.chatEndpoint,
    window.location.origin,
  );
  mountUrl.pathname = `${mountUrl.pathname.replace(/\/+$/u, "")}/${instanceId}`;
  return createFlueClient({
    url: mountUrl.href,
    headers: () => {
      const revisionId = currentRevisionId();
      return {
        ...agentOwnershipHeaders(identity),
        ...(revisionId === undefined
          ? {}
          : { [BRUNCH_DOCUMENT_REVISION_HEADER]: revisionId }),
      };
    },
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
  readonly activeHandleRef: RefObject<ActiveHandle | null>;
  readonly binding: ProcessAgentBinding | null;
  readonly brunchSelected: boolean;
}) => {
  "use no memo"; // The Flue header callback deliberately reads the live handle ref after render.

  const readCurrentRevisionId = useCallback(() => {
    const handle = input.activeHandleRef.current;
    return input.binding !== null &&
      handle?.document.documentId === input.binding.documentId &&
      handle.document.incarnationId === input.binding.incarnationId
      ? handle.handle.revisionId.get()
      : undefined;
  }, [input.activeHandleRef, input.binding]);

  return useMemo(() => {
    const conversationTracker = createConversationTrackerFor(
      input.binding?.conversationId ?? null,
    );
    const flueClientPromise =
      input.brunchSelected && input.binding !== null
        ? createBrunchFlueClient(
            input.binding.conversationId,
            readCurrentRevisionId,
          )
        : null;
    return { conversationTracker, flueClientPromise };
  }, [input.binding, input.brunchSelected, readCurrentRevisionId]);
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
 * The demo's own palette commands, registered beside Petrinaut's: one starts
 * a fresh net, one switches between Brunch and the stock assistant, one
 * toggles Brunch demo mode, the persisted user setting that shows the
 * prepared-fixture selector.
 */
const DemoCommands = ({
  createNewNet,
  createCleanNetProjection,
  brunchSelected,
  canSelectAssistant,
  selectAssistant,
}: {
  createNewNet: (params: { petriNetDefinition: SDCPN; title: string }) => void;
  createCleanNetProjection?: () => Promise<void>;
  brunchSelected: boolean;
  canSelectAssistant: boolean;
  selectAssistant: (selection: "brunch" | "stock") => void;
}) => {
  const { brunchDemoMode, setBrunchDemoMode } = use(UserSettingsContext);
  useCommand({
    id: "demo.net.new",
    label: "Create a new empty net",
    category: "Demo",
    keywords: ["file"],
    run: () =>
      createNewNet({ petriNetDefinition: emptySDCPN, title: "New Process" }),
  });
  // Only offered when there is a Brunch to select; without an endpoint the
  // stock assistant is the only one and the choice would be a fiction.
  useCommand(
    {
      id: "demo.worked-model.fresh-net-projection",
      label: "Create a fresh net projection from this template",
      category: "Demo",
      keywords: ["fresh", "net", "projection", "template"],
      run: () => {
        void createCleanNetProjection?.();
      },
    },
    { when: createCleanNetProjection !== undefined },
  );
  useCommand(
    {
      id: "demo.assistant.switch",
      label: brunchSelected
        ? "Use the stock Petrinaut assistant"
        : "Use Brunch (default assistant)",
      category: "Demo",
      keywords: ["assistant", "brunch", "stock", "ai"],
      run: () => selectAssistant(brunchSelected ? "stock" : "brunch"),
    },
    { when: brunchPreviewConfig.isBrunchConfigured && canSelectAssistant },
  );
  useCommand(
    {
      id: "demo.brunch.toggle-demo-mode",
      label: "Toggle Brunch demo mode",
      category: "Demo",
      keywords: ["fixture", "prepared", "crew reservation"],
      run: () => setBrunchDemoMode(!brunchDemoMode),
    },
    { when: brunchSelected },
  );
  return null;
};

/**
 * The prepared-fixture selector, shown only while Brunch demo mode is on: a
 * demo affordance, never part of the default shell.
 */
const DemoModeFixtureSelector = () => {
  const { brunchDemoMode } = use(UserSettingsContext);
  return brunchDemoMode ? <PreparedFixtureSelector /> : null;
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
    search: LocalStorageDemoSearch,
    history: "push" | "replace",
  ) => void;
  search: LocalStorageDemoSearch;
}) => {
  const sentryFeedbackAction = useSentryFeedbackAction();
  const routeIdentity = localStorageDemoRouteIdentity(search);
  const remoteRouteSelected =
    routeIdentity === "worked-model-bundle" && search.bundle !== undefined;
  // Brunch is the default assistant; the stock assistant is the host-selected
  // alternate. Every Brunch-specific branch below keys off this, never off the
  // bare configuration, so selecting stock leaves no Brunch dependency behind.
  const {
    ready: assistantSelectionReady,
    selection: assistantSelection,
    setSelection: selectAssistant,
  } = useAssistantSelection({ enabled: !remoteRouteSelected });
  const brunchSelected = remoteRouteSelected
    ? brunchPreviewConfig.isBrunchConfigured
    : assistantSelectionReady &&
      isBrunchSelected(
        brunchPreviewConfig.isBrunchConfigured,
        assistantSelection,
      );
  const [openAIVoiceConfig, setOpenAIVoiceConfig] = useState<
    OpenAIVoiceConfig | null | undefined
  >(() => (brunchSelected ? undefined : null));
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
  const { aiMessagesByNetId, setAiMessagesByNetId } = useLocalStorageAiMessages(
    { enabled: !remoteRouteSelected },
  );
  /**
   * The fixture is only reachable when Brunch is configured: without an
   * endpoint there is no Flue client to prepare the conversation, so the URL
   * falls back to the ordinary demo rather than a banner stuck on preparing.
   */
  const constructionSelected =
    brunchSelected && !remoteRouteSelected && isConstructionSelected(search);
  const rootCreationSelected =
    constructionSelected && search.brunchTracer === "root-creation";
  const productConstructionSelected =
    brunchSelected &&
    (routeIdentity === "ordinary" || routeIdentity === "worked-model-bundle");
  const batchedConstructionSelected =
    rootCreationSelected || productConstructionSelected;
  const crewReservationFixtureSelected =
    brunchSelected &&
    !remoteRouteSelected &&
    (isCrewReservationFixtureSelected(search) || constructionSelected);
  const rootArcTracerSelected =
    crewReservationFixtureSelected &&
    (isRootArcTracerSelected(search) || constructionSelected);
  const selectLocalRoute = useCallback(
    () =>
      onSearchChange(
        {
          bundle: undefined,
          "brunch-fixture": undefined,
          brunchTracer: undefined,
        },
        "push",
      ),
    [onSearchChange],
  );
  const { controller } = useDocumentController({
    bundleKey: search.bundle,
    chatEndpoint: brunchPreviewConfig.chatEndpoint,
    currentOrigin: window.location.origin,
    isBrunchConfigured: brunchPreviewConfig.isBrunchConfigured,
    principalKey: brunchPrincipal,
    remoteRouteSelected,
    onOpenDocument: clearSharedLocation,
    onSelectLocalRoute: selectLocalRoute,
    fixture: {
      enabled: brunchSelected && !remoteRouteSelected,
      crewReservationSelected: crewReservationFixtureSelected,
      rootArcTracerSelected,
      constructionSelected,
      rootCreationSelected,
    },
  });
  const { source } = controller;
  const currentDocument = source.repository.current;
  const currentNetId = currentDocument?.documentId ?? null;
  const currentNetTitle = currentDocument?.title ?? "";

  useEffect(() => {
    if (!brunchSelected) {
      return;
    }

    const abortController = new AbortController();
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
  const activeHandleRef = useRef<ActiveHandle | null>(null);

  useLayoutEffect(() => {
    activeHandleRef.current = activeHandle;
  }, [activeHandle]);

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
    const repository = source.repository;
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
  }, [activeHandle, source.repository]);
  const unsavedChangeMessage =
    persistFailure !== null &&
    persistFailure.documentId === currentDocument?.documentId &&
    persistFailure.incarnationId === currentDocument.incarnationId
      ? persistFailure.error.message
      : null;

  const existingNets: MinimalNetMetadata[] = source.repository.records
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
    controller.createLocalAndOpen({
      definition: params.petriNetDefinition,
      title: params.title,
    });

  const loadPetriNet = (petriNetId: string) => {
    source.repository.open(petriNetId);
  };

  const renameCurrentDocument = source.repository.actions.rename;
  const setTitle =
    currentDocument === null || renameCurrentDocument === undefined
      ? undefined
      : (title: string) =>
          renameCurrentDocument({
            documentId: currentDocument.documentId,
            title,
          });
  const fixtureSeed = source.processAgentSeed?.fixture;
  const preparedFixtureIsCurrent = fixtureSeed?.mode === "prepared";
  const tracerIsCurrent =
    fixtureSeed !== undefined && fixtureSeed.mode !== "prepared";
  const fixtureConfiguration = preparedFixtureIsCurrent
    ? crewReservationFixtureConfiguration
    : undefined;
  const productConstructionConversationId =
    currentDocument === null
      ? undefined
      : productConstructionSelected
        ? ordinaryConstructionConversationIdFrom(currentDocument.incarnationId)
        : undefined;
  const fixtureProcessAgentConfiguration = useMemo<
    FixtureProcessAgentConfiguration | undefined
  >(
    () =>
      productConstructionConversationId === undefined
        ? undefined
        : { conversationId: productConstructionConversationId },
    [productConstructionConversationId],
  );
  const processAgentBinding = useProcessAgentBinding({
    document: currentDocument,
    seed: source.processAgentSeed,
    fixture: fixtureProcessAgentConfiguration,
  });
  const conversationId = processAgentBinding?.conversationId ?? null;
  const processAgentSession = useProcessAgentSession({
    activeHandleRef,
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
  const rootArcBrowser = useMemo(() => {
    if (
      !activeHandle ||
      processAgentBinding === null ||
      activeHandle.document.documentId !== processAgentBinding.documentId
    )
      return undefined;
    if (productConstructionSelected) {
      return {
        binding: processAgentBinding,
        construction: true as const,
      };
    }
    const requestedBaseHash = fixtureSeed?.requestedBaseHash;
    if (
      !tracerIsCurrent ||
      (!constructionSelected && requestedBaseHash === undefined)
    )
      return undefined;
    return {
      binding: processAgentBinding,
      ...(constructionSelected
        ? { construction: true as const }
        : { requestedBaseHash }),
    };
  }, [
    tracerIsCurrent,
    activeHandle,
    constructionSelected,
    fixtureSeed,
    processAgentBinding,
    productConstructionSelected,
  ]);
  // The handle mutates behind a stable identity. Subscribe to its real snapshot;
  // a render-time read alone can be memoized by React Compiler across hand edits.
  const subscribeToObservedLiveHash = useCallback(
    (changed: () => void) =>
      rootArcBrowser && activeHandle
        ? activeHandle.handle.subscribe(changed)
        : () => {},
    [activeHandle, rootArcBrowser],
  );
  const getObservedLiveHash = useCallback(
    () =>
      rootArcBrowser && activeHandle?.handle.doc()
        ? observeBrowserDefinition(activeHandle.handle).sha256
        : undefined,
    [activeHandle, rootArcBrowser],
  );
  const getServerObservedLiveHash = useCallback(() => undefined, []);
  const observedLiveHash = useSyncExternalStore(
    subscribeToObservedLiveHash,
    getObservedLiveHash,
    getServerObservedLiveHash,
  );
  const mutationRecorder = useMemo(
    () =>
      rootArcBrowser && activeHandle
        ? createJoinedBrowserMutationRecorder({
            handle: activeHandle.handle,
            ...rootArcBrowser,
            onContainedFailure: (failure) =>
              reportBrunchFailure("mutation-record", failure.error, {
                kind: failure.kind,
                toolCallId: failure.toolCallId,
              }),
          })
        : undefined,
    [rootArcBrowser, activeHandle, reportBrunchFailure],
  );
  const rootArcPreparationBrowser = selectCrewReservationPreparationBrowser(
    batchedConstructionSelected,
    rootArcBrowser,
  );
  const rootArcPreparation = rootArcPreparationBrowser !== undefined;
  const tracerPreparation = usePrepareCrewReservationConversation(
    flueClientPromise,
    rootArcPreparation,
    rootArcPreparationBrowser,
  );
  const constructionClientTools = batchedConstructionSelected
    ? batchedConstructionClientToolNames
    : constructionSelected
      ? constructionClientToolNames
      : fixtureConfiguration?.clientToolNames;
  const flueHistory = useFlueChatHistory(
    flueClientPromise,
    conversationId ?? "",
    constructionClientTools,
    mutationRecorder?.mapClientToolInput ??
      fixtureConfiguration?.mapClientToolInput,
    mutationRecorder?.validatedClientToolNames,
    brunchPetrinautDynamicToolNames,
  );
  useEffect(() => {
    if (flueHistory.error === undefined) return;
    reportBrunchFailure("history", flueHistory.error, {
      phase: flueHistory.phase ?? "unknown",
    });
  }, [flueHistory.error, flueHistory.phase, reportBrunchFailure]);
  const brunchVoiceMode = useMemo(
    () =>
      getBrunchVoiceMode(
        brunchSelected ? openAIVoiceConfig : null,
        conversationTracker,
        flueHistory.settlements,
      ),
    [
      brunchSelected,
      conversationTracker,
      flueHistory.settlements,
      openAIVoiceConfig,
    ],
  );
  const crewReservationSession = useCrewReservationFixtureSession({
    clientPromise: flueClientPromise,
    definition:
      currentDocument?.documentId === crewReservationDocumentId
        ? currentDocument.definition
        : undefined,
    enabled: fixtureConfiguration !== undefined && !tracerIsCurrent,
    history: flueHistory.snapshot,
    historyError: flueHistory.error?.message,
    refreshHistory: flueHistory.refresh,
    repository: source.repository,
  });
  const transportClientPromise = constructionSelected
    ? flueClientPromise
    : tracerIsCurrent
      ? tracerPreparation.clientPromise
      : fixtureConfiguration === undefined
        ? flueClientPromise
        : crewReservationSession.transportClientPromise;
  const petrinautAiChatTransport = useMemo(() => {
    if (transportClientPromise !== null) {
      return createBrunchPanelTransport(
        transportClientPromise,
        conversationTracker,
        {
          ...((constructionSelected || productConstructionSelected) &&
          rootArcBrowser
            ? {
                initialData: {
                  mode: batchedConstructionSelected
                    ? batchedConstructionMode
                    : conversationConstructionMode,
                  construction: { binding: rootArcBrowser.binding },
                },
              }
            : {}),
          dynamicClientToolNames: brunchPetrinautDynamicToolNames,
          ...(constructionClientTools === undefined
            ? {}
            : {
                clientToolNames: constructionClientTools,
                mapClientToolInput:
                  mutationRecorder?.mapClientToolInput ??
                  fixtureConfiguration?.mapClientToolInput,
                validatedClientToolNames:
                  mutationRecorder?.validatedClientToolNames,
                clientToolResultMetadata:
                  mutationRecorder?.clientToolResultMetadata,
              }),
          onAdmission: flueHistory.refresh,
          onToolOutputError: (event) =>
            reportBrunchFailure("server-tool", new Error(event.errorText), {
              submissionId: event.submissionId,
              toolCallId: event.toolCallId,
              toolName: event.toolName ?? "unknown",
              hidden: event.hidden,
            }),
        },
      );
    }
    return fixtureConfiguration !== undefined
      ? createUnavailableBrunchPanelTransport(
          crewReservationSession.transportUnavailableReason,
        )
      : stockChatTransport;
  }, [
    conversationTracker,
    constructionClientTools,
    constructionSelected,
    batchedConstructionSelected,
    productConstructionSelected,
    rootArcBrowser,
    crewReservationSession.transportUnavailableReason,
    fixtureConfiguration,
    flueHistory.refresh,
    reportBrunchFailure,
    transportClientPromise,
    mutationRecorder,
  ]);

  const aiAssistant = useMemo(() => {
    const activityIdentities =
      rootArcBrowser && flueHistory.ready
        ? flueHistory.phase === "absent"
          ? []
          : flueHistory.snapshot === undefined
            ? undefined
            : foldBrunchWorkpieceHistory(
                flueHistory.snapshot.messages,
                rootArcBrowser.binding,
              ).activityIdentities
        : undefined;
    return {
      additionalTab: rootArcBrowser
        ? {
            label: "Ledger",
            activityIdentities,
            content: (
              <BrunchWorkpiecePane
                messages={flueHistory.snapshot?.messages ?? []}
                construction={
                  constructionSelected || productConstructionSelected
                }
                binding={rootArcBrowser.binding}
                liveHash={observedLiveHash}
              />
            ),
          }
        : undefined,
      ...(brunchSelected
        ? {
            primaryLabel: "Chat",
            toolStateLabels: brunchToolStateLabels,
          }
        : {}),
      ...(conversationId === null ? {} : { conversationId }),
      canClearMessages: flueClientPromise === null,
      // Brunch's own tool names wrap canonical Petrinaut operations here, in
      // the host; Petrinaut keeps its names and executes only what it is told.
      automaticTools:
        flueClientPromise === null
          ? []
          : createBrunchPetrinautTools({
              readTitle: () => currentNetTitle,
              ...(batchedConstructionSelected && rootArcBrowser
                ? {
                    mutation: {
                      binding: rootArcBrowser.binding,
                      retainAttempt: mutationRecorder?.retainAttempt,
                      onOperationFailure: (failure) =>
                        reportBrunchFailure("mutate-petrinet", failure.error, {
                          toolCallId: failure.toolCallId,
                          operationId: failure.operationId,
                          operationType: failure.operationType,
                          status: failure.status,
                        }),
                    },
                  }
                : {}),
              ...(currentDocument === null
                ? {}
                : {
                    settleDocumentRevision: (revisionId) =>
                      source.repository.settleRevision({
                        documentId: currentDocument.documentId,
                        revisionId,
                      }),
                  }),
            }),
      interactiveTools: [],
      transport: petrinautAiChatTransport,
      ...(mutationRecorder === undefined
        ? {}
        : { executeMutation: mutationRecorder.executeMutation }),
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
    batchedConstructionSelected,
    constructionSelected,
    observedLiveHash,
    productConstructionSelected,
    rootArcBrowser,
    conversationTracker,
    conversationId,
    currentNetId,
    currentNetTitle,
    flueClientPromise,
    flueHistory.messages,
    flueHistory.phase,
    flueHistory.ready,
    flueHistory.snapshot,
    petrinautAiChatTransport,
    reportBrunchFailure,
    mutationRecorder,
    setAiMessagesByNetId,
    currentDocument,
    source.repository,
  ]);

  if (source.repository.status.state === "unavailable") {
    return (
      <main role="main">
        <h1>Worked-model document unavailable</h1>
        <p>{source.repository.status.error.message}</p>
      </main>
    );
  }

  if (
    source.repository.status.state === "loading" ||
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
      {remoteRouteSelected || unsavedChangeMessage !== null ? (
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
          {remoteRouteSelected ? (
            <p
              style={{
                background: "#edf6ff",
                border: "1px solid #91caff",
                borderRadius: 8,
                boxShadow: "0 2px 8px rgba(20, 33, 50, 0.12)",
                color: "#0958d9",
                margin: 0,
                padding: "10px 12px",
              }}
            >
              This document uses the Brunch process assistant
            </p>
          ) : null}
          {unsavedChangeMessage !== null ? (
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
              Changes not saved: {unsavedChangeMessage} The editor shows the
              last saved version.
            </p>
          ) : null}
        </div>
      ) : null}
      {tracerIsCurrent &&
        !constructionSelected &&
        createPortal(
          <RootArcTracerBanner status={tracerPreparation.status} />,
          document.body,
        )}
      {preparedFixtureIsCurrent &&
        !tracerIsCurrent &&
        createPortal(
          <PreparedFixtureBanner
            bundle={crewReservationSession.bundle}
            currentWorkpiece={crewReservationSession.currentWorkpiece}
            settlementStatus={crewReservationSession.settlementStatus}
          />,
          document.body,
        )}
      {/* The settings are mounted here, above the editor, so the demo's own
          command and selector read the same persisted state the editor does. */}
      <UserSettingsProvider>
        {brunchSelected && !preparedFixtureIsCurrent ? (
          <DemoModeFixtureSelector />
        ) : null}
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
              title={currentDocument.title}
              viewportActions={[sentryFeedbackAction]}
            />
          </WalkthroughProvider>
          <DemoCommands
            createNewNet={createNewNet}
            createCleanNetProjection={
              source.repository.actions.createCleanNetProjection
            }
            brunchSelected={brunchSelected}
            canSelectAssistant={!remoteRouteSelected}
            selectAssistant={selectAssistant}
          />
          <CommandPalette />
        </CommandRegistryProvider>
      </UserSettingsProvider>
    </div>
  );
};
