/**
 * @layerRoot website.local-storage-demo
 * @role Editable demo shell: nets in local storage, one live document handle
 */

import { createFlueClient, type FlueConversationSettlement } from "@flue/sdk";
import { castDraft, produce } from "immer";
import {
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";

import {
  batchedConstructionMode,
  conversationConstructionMode,
  layoutPetrinautNetToolName,
  legacyLayoutPetrinautNetToolName,
  legacyMutatePetrinautNetToolName,
  legacyReadPetrinautDiagnosticsToolName,
  legacyReadPetrinautNetToolName,
  LEGACY_READ_PETRINAUT_DOCS_TOOL_NAME,
  mutatePetrinautNetToolName,
  observedConstructionBrowserToolNames,
  readPetrinautDiagnosticsToolName,
  readPetrinautNetToolName,
  READ_PETRINAUT_DOCS_TOOL_NAME,
} from "@hashintel/brunch-agent-plugin-sdcpn";
import {
  agentOwnershipHeaders,
  flueConversationIdWeb,
} from "@hashintel/brunch-agent-transport-aisdk";
import { BRUNCH_DOCUMENT_REVISION_HEADER } from "@hashintel/brunch-agent-transport-aisdk/headers";
import {
  createJsonDocHandle,
  getLatestNetDefinitionToolName,
  getNetCompilationErrorsToolName,
  readPetrinautDocToolName,
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
  getOrCreateBrunchConversationId,
  ordinaryConstructionConversationIdFrom,
} from "./brunch-conversation-id";
import {
  BrunchPanelConversationTracker,
  type BrunchPanelAdmissionTarget,
  createBrunchPanelTransport,
  createUnavailableBrunchPanelTransport,
} from "./brunch-panel-transport";
import { resolveBrunchPreviewConfig } from "./brunch-preview-config";
import { getOrCreateBrunchPrincipal } from "./brunch-principal";
import { BrunchWorkpiecePane } from "./brunch-workpiece-pane";
import {
  isCrewReservationFixtureSelected,
  isRootArcTracerSelected,
  isConstructionSelected,
  localStorageDemoRouteIdentity,
} from "./local-storage-demo-search";
import { createMutatePetrinetAutomaticTool } from "./mutate-petrinet-tool";
import {
  createJoinedBrowserMutationRecorder,
  observeBrowserDefinition,
} from "./mutation-record";
import {
  crewReservationDocumentId,
  preparedCrewReservationNet,
} from "./prepared-crew-reservation-fixture";
import {
  PreparedFixtureBanner,
  PreparedFixtureSelector,
  RootArcTracerBanner,
} from "./prepared-fixture-banner";
import { resolveCrewReservationBundle } from "./resolve-crew-reservation-bundle";
import {
  crewReservationFixtureConfiguration,
  useCrewReservationFixtureSession,
} from "./use-crew-reservation-fixture-session";
import { useCrewReservationSettledManifestStorage } from "./use-crew-reservation-settled-manifest";
import { useFlueChatHistory } from "./use-flue-chat-history";
import { useLocalStorageAiMessages } from "./use-local-storage-ai-messages";
import {
  createLocalStorageNetRecord,
  emptySDCPN,
  isEmptySDCPN,
  type SDCPNInLocalStorage,
  useLocalStorageSDCPNs,
} from "./use-local-storage-sdcpns";
import {
  selectCrewReservationPreparationBrowser,
  usePrepareCrewReservationConversation,
} from "./use-prepare-crew-reservation-conversation";
import { useWorkedModelCopy } from "./use-worked-model-copy";
import { walkthroughSteps } from "./walkthrough/walkthrough-steps";

import type { SharedExampleSearch } from "../../../examples/example-search";
import type { LocalStorageDemoSearch } from "./local-storage-demo-search";

const createDefaultStoredSDCPN = (): SDCPNInLocalStorage => ({
  id: "net-1",
  title: "New Process",
  sdcpn: emptySDCPN,
  lastUpdated: new Date(0).toISOString(),
});

const preparedCrewReservationStoredSDCPN: SDCPNInLocalStorage = {
  id: crewReservationDocumentId,
  title: "Prepared final inspection and dispatch",
  sdcpn: preparedCrewReservationNet,
  lastUpdated: new Date(0).toISOString(),
};

const legacyConstructionDocumentId = "synthetic-construction-substrate-v1";
const constructionClientToolNames: ReadonlySet<string> = new Set([
  READ_PETRINAUT_DOCS_TOOL_NAME,
  LEGACY_READ_PETRINAUT_DOCS_TOOL_NAME,
  ...observedConstructionBrowserToolNames,
  legacyReadPetrinautNetToolName,
  legacyReadPetrinautDiagnosticsToolName,
]);
const batchedConstructionClientToolNames: ReadonlySet<string> = new Set([
  READ_PETRINAUT_DOCS_TOOL_NAME,
  LEGACY_READ_PETRINAUT_DOCS_TOOL_NAME,
  readPetrinautNetToolName,
  legacyReadPetrinautNetToolName,
  readPetrinautDiagnosticsToolName,
  legacyReadPetrinautDiagnosticsToolName,
  mutatePetrinautNetToolName,
  legacyMutatePetrinautNetToolName,
  layoutPetrinautNetToolName,
  legacyLayoutPetrinautNetToolName,
]);
const batchedConstructionDynamicToolNames: ReadonlySet<string> = new Set([
  READ_PETRINAUT_DOCS_TOOL_NAME,
  readPetrinautNetToolName,
  readPetrinautDiagnosticsToolName,
  mutatePetrinautNetToolName,
  layoutPetrinautNetToolName,
]);
const brunchPetrinautToolAliases = {
  [READ_PETRINAUT_DOCS_TOOL_NAME]: readPetrinautDocToolName,
  [readPetrinautNetToolName]: getLatestNetDefinitionToolName,
  [readPetrinautDiagnosticsToolName]: getNetCompilationErrorsToolName,
  [layoutPetrinautNetToolName]: legacyLayoutPetrinautNetToolName,
} as const;
const rootArcTracerDocumentId = `${crewReservationDocumentId}:root-arc`;
const createRootArcTracerDocument = (): SDCPNInLocalStorage => ({
  ...preparedCrewReservationStoredSDCPN,
  id: rootArcTracerDocumentId,
  incarnationId: crypto.randomUUID(),
  sdcpn: structuredClone(preparedCrewReservationNet),
  title: "Prepared root-arc mechanical tracer",
});

const DEMO_CAPABILITIES = {
  disabledExtensions: [],
} satisfies PetrinautHandleCapabilities;

const brunchPreviewConfig = resolveBrunchPreviewConfig(
  import.meta.env.VITE_BRUNCH_CHAT_ENDPOINT,
);

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

const createHandle = (net: SDCPNInLocalStorage): PetrinautDocHandle =>
  createJsonDocHandle({
    id: net.id,
    initial: net.sdcpn,
    initialRevisionId: net.revisionId,
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

const getStoredSDCPNsForDisplay = (
  storedSDCPNs: Record<string, SDCPNInLocalStorage>,
  selectedDocument: SDCPNInLocalStorage | undefined,
): Record<string, SDCPNInLocalStorage> => {
  if (selectedDocument !== undefined) {
    return {
      ...storedSDCPNs,
      [selectedDocument.id]: selectedDocument,
    };
  }
  if (Object.values(storedSDCPNs).length > 0) {
    return storedSDCPNs;
  }

  const defaultStoredSDCPN = createDefaultStoredSDCPN();
  return { [defaultStoredSDCPN.id]: defaultStoredSDCPN };
};

type ActiveHandle = {
  handle: PetrinautDocHandle;
  netId: string;
  fallbackNet: SDCPNInLocalStorage;
};

const createActiveHandle = (net: SDCPNInLocalStorage): ActiveHandle => {
  const handle = createHandle(net);
  const fallbackNet: SDCPNInLocalStorage = {
    ...net,
    incarnationId: net.incarnationId ?? crypto.randomUUID(),
    revisionId: handle.revisionId.get(),
  };
  return {
    handle,
    netId: fallbackNet.id,
    fallbackNet:
      fallbackNet.id === rootArcTracerDocumentId &&
      fallbackNet.rootArcRequestedBaseHash === undefined
        ? {
            ...fallbackNet,
            rootArcRequestedBaseHash: observeBrowserDefinition(handle).sha256,
          }
        : fallbackNet,
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
  createCleanWorkedModelCopy,
  brunchSelected,
  selectAssistant,
}: {
  createNewNet: (params: { petriNetDefinition: SDCPN; title: string }) => void;
  createCleanWorkedModelCopy?: () => Promise<void>;
  brunchSelected: boolean;
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
      id: "demo.worked-model.clean-copy",
      label: "Create a clean copy of this worked model",
      category: "Demo",
      keywords: ["bundle", "copy", "reset", "template"],
      run: () => {
        void createCleanWorkedModelCopy?.();
      },
    },
    { when: createCleanWorkedModelCopy !== undefined },
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
    { when: brunchPreviewConfig.isBrunchConfigured },
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
    search: SharedExampleSearch,
    history: "push" | "replace",
  ) => void;
  search: LocalStorageDemoSearch;
}) => {
  const sentryFeedbackAction = useSentryFeedbackAction();
  // Brunch is the default assistant; the stock assistant is the host-selected
  // alternate. Every Brunch-specific branch below keys off this, never off the
  // bare configuration, so selecting stock leaves no Brunch dependency behind.
  const { selection: assistantSelection, setSelection: selectAssistant } =
    useAssistantSelection();
  const brunchSelected = isBrunchSelected(
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
  const clearSharedLocation = () => {
    navigation.onNavigate(withClearedSharedLocation, {
      history: "replace",
      intent: { cause: "normalization", action: "selection" },
    });
  };
  const { aiMessagesByNetId, setAiMessagesByNetId } =
    useLocalStorageAiMessages();
  const { storedSDCPNs, setStoredSDCPNs } = useLocalStorageSDCPNs();
  const routeIdentity = localStorageDemoRouteIdentity(search);
  const workedModelSelected =
    brunchSelected &&
    routeIdentity === "worked-model-bundle" &&
    search.bundle !== undefined;
  const workedModel = useWorkedModelCopy({
    bundleKey: search.bundle,
    chatEndpoint: brunchPreviewConfig.chatEndpoint,
    currentOrigin: window.location.origin,
    enabled: workedModelSelected,
    principalKey: brunchPrincipal,
  });
  const workedModelDocument = useMemo<SDCPNInLocalStorage | undefined>(
    () =>
      workedModel.copy === null
        ? undefined
        : {
            id: workedModel.copy.documentId,
            title: workedModel.copy.title,
            sdcpn: workedModel.copy.definition,
            incarnationId: workedModel.copy.incarnationId,
            revisionId: workedModel.copy.revisionId,
            lastUpdated: new Date(0).toISOString(),
          },
    [workedModel.copy],
  );
  const { settledManifest, setSettledManifest } =
    useCrewReservationSettledManifestStorage();
  /**
   * The fixture is only reachable when Brunch is configured: without an
   * endpoint there is no Flue client to prepare the conversation, so the URL
   * falls back to the ordinary demo rather than a banner stuck on preparing.
   */
  const constructionSelected = brunchSelected && isConstructionSelected(search);
  const rootCreationSelected =
    constructionSelected && search.brunchTracer === "root-creation";
  const productConstructionSelected =
    brunchSelected &&
    (routeIdentity === "ordinary" || routeIdentity === "worked-model-bundle");
  const batchedConstructionSelected =
    rootCreationSelected || productConstructionSelected;
  const constructionDocumentId = rootCreationSelected
    ? "synthetic-root-creation-v1"
    : legacyConstructionDocumentId;
  const tracerDocumentId = constructionSelected
    ? constructionDocumentId
    : rootArcTracerDocumentId;
  const crewReservationFixtureSelected =
    brunchSelected &&
    (isCrewReservationFixtureSelected(search) || constructionSelected);
  const rootArcTracerSelected =
    crewReservationFixtureSelected &&
    (isRootArcTracerSelected(search) || constructionSelected);
  const [initialTracerDocument] = useState(() => ({
    ...createRootArcTracerDocument(),
    id: tracerDocumentId,
    ...(rootCreationSelected
      ? {
          title: "Synthetic root creation — empty document",
          sdcpn: structuredClone(emptySDCPN),
        }
      : constructionSelected
        ? { title: "Synthetic construction substrate — no prepared workpiece" }
        : {}),
  }));
  const fixtureDocumentId = rootArcTracerSelected
    ? tracerDocumentId
    : crewReservationDocumentId;
  const crewReservationBundle =
    crewReservationFixtureSelected && !rootArcTracerSelected
      ? resolveCrewReservationBundle({
          fallbackDocument: preparedCrewReservationStoredSDCPN,
          manifest: settledManifest,
          storedDocument: storedSDCPNs[crewReservationDocumentId],
        })
      : undefined;
  const storedSDCPNsForDisplay = getStoredSDCPNsForDisplay(
    storedSDCPNs,
    workedModelDocument ??
      (rootArcTracerSelected
        ? (storedSDCPNs[tracerDocumentId] ?? initialTracerDocument)
        : crewReservationBundle?.selectedDocument),
  );

  useEffect(() => {
    if (
      !crewReservationFixtureSelected ||
      rootArcTracerSelected ||
      storedSDCPNs[crewReservationDocumentId] !== undefined
    ) {
      return;
    }
    setStoredSDCPNs((previous) => ({
      ...previous,
      [crewReservationDocumentId]: preparedCrewReservationStoredSDCPN,
    }));
  }, [
    crewReservationFixtureSelected,
    rootArcTracerSelected,
    setStoredSDCPNs,
    storedSDCPNs,
  ]);

  const persistCrewReservationSnapshot = useCallback(
    (sha256: string, definition: SDCPN) => {
      setStoredSDCPNs((previous) => {
        const document =
          previous[crewReservationDocumentId] ??
          preparedCrewReservationStoredSDCPN;

        return {
          ...previous,
          [crewReservationDocumentId]: {
            ...document,
            coherentSnapshots: {
              ...document.coherentSnapshots,
              [sha256]: structuredClone(definition),
            },
          },
        };
      });
    },
    [setStoredSDCPNs],
  );

  useEffect(() => {
    if (!brunchSelected) {
      // Voice is a Brunch feature; the stock assistant never shows it.
      setOpenAIVoiceConfig(null);
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

  // Pick the most recently modified net
  const mostRecentlyModifiedNet =
    Object.values(storedSDCPNsForDisplay).sort(
      (a, b) =>
        new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime(),
    )[0] ?? null;
  const initiallySelectedNet = workedModelSelected
    ? workedModelDocument
    : crewReservationFixtureSelected
      ? storedSDCPNsForDisplay[fixtureDocumentId]
      : mostRecentlyModifiedNet;

  // The net currently selected in the UI.
  const [currentNetId, setCurrentNetId] = useState<string | null>(
    () => initiallySelectedNet?.id ?? null,
  );

  // Metadata and persisted SDCPN snapshot for the selected net.
  const currentNet = currentNetId
    ? (storedSDCPNsForDisplay[currentNetId] ?? null)
    : null;

  // Live editable document handle for the selected net only.
  const [activeHandle, setActiveHandle] = useState<ActiveHandle | null>(() =>
    initiallySelectedNet ? createActiveHandle(initiallySelectedNet) : null,
  );

  useEffect(() => {
    if (
      workedModelDocument === undefined ||
      currentNetId === workedModelDocument.id
    )
      return;
    setCurrentNetId(workedModelDocument.id);
    setActiveHandle(createActiveHandle(workedModelDocument));
  }, [currentNetId, workedModelDocument]);

  useEffect(() => {
    if (!activeHandle) {
      return;
    }

    const { fallbackNet, handle, netId } = activeHandle;
    const isWorkedModelDocument = workedModel.copy?.documentId === netId;
    const isTracerDocument =
      netId === rootArcTracerDocumentId || netId === constructionDocumentId;
    if (!isWorkedModelDocument) {
      setStoredSDCPNs((previous) => {
        const stored = previous[netId];
        if (
          stored?.incarnationId === fallbackNet.incarnationId &&
          stored?.revisionId === fallbackNet.revisionId &&
          (!isTracerDocument ||
            stored?.rootArcRequestedBaseHash ===
              fallbackNet.rootArcRequestedBaseHash)
        ) {
          return previous;
        }
        return {
          ...previous,
          [netId]: {
            ...(stored ?? fallbackNet),
            incarnationId: fallbackNet.incarnationId,
            revisionId: fallbackNet.revisionId,
            rootArcRequestedBaseHash: fallbackNet.rootArcRequestedBaseHash,
          },
        };
      });
    }

    return handle.subscribe((event) => {
      if (isWorkedModelDocument) {
        void workedModel.persistDefinition({
          definition: event.next,
          previousRevisionId: event.previousRevisionId,
          revisionId: event.revisionId,
        });
        return;
      }
      const lastUpdated = new Date().toISOString();

      setStoredSDCPNs((prev) => {
        const stored = prev[netId] ?? fallbackNet;
        const next: SDCPNInLocalStorage = {
          ...stored,
          sdcpn: event.next,
          revisionId: event.revisionId,
          lastUpdated,
        };

        return produce(prev, (draft) => {
          draft[netId] = castDraft(next);
        });
      });
    });
  }, [
    activeHandle,
    setStoredSDCPNs,
    constructionDocumentId,
    workedModel.copy?.documentId,
    workedModel.persistDefinition,
  ]);

  const existingNets: MinimalNetMetadata[] = Object.values(
    storedSDCPNsForDisplay,
  )
    .map((net) => ({
      netId: net.id,
      title: net.title,
      lastUpdated: net.lastUpdated,
    }))
    .sort(
      (a, b) =>
        new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime(),
    );

  const createNewNet = (params: {
    petriNetDefinition: SDCPN;
    title: string;
  }) => {
    const newNet = createLocalStorageNetRecord(params);
    const previousNet =
      currentNetId && currentNetId !== newNet.id ? currentNet : null;
    const previousNetIdToRemove = previousNet !== null ? currentNetId : null;

    setStoredSDCPNs((prev) => {
      const next = { ...prev, [newNet.id]: newNet };

      // Remove the previous net if it was empty and unmodified
      if (
        previousNetIdToRemove &&
        previousNet &&
        isEmptySDCPN(prev[previousNetIdToRemove]?.sdcpn ?? previousNet.sdcpn)
      ) {
        delete next[previousNetIdToRemove];
      }

      return next;
    });
    setActiveHandle(createActiveHandle(newNet));
    setCurrentNetId(newNet.id);
    clearSharedLocation();
  };

  const loadPetriNet = (petriNetId: string) => {
    const netToLoad = storedSDCPNsForDisplay[petriNetId];
    if (!netToLoad) {
      return;
    }

    // Remove the current net if it was empty and unmodified
    if (currentNetId && currentNetId !== petriNetId) {
      const previousNetIdToRemove =
        currentNet && isEmptySDCPN(currentNet.sdcpn) ? currentNetId : null;

      setStoredSDCPNs((prev) => {
        const prevNet = previousNetIdToRemove
          ? prev[previousNetIdToRemove]
          : null;

        if (previousNetIdToRemove && prevNet && isEmptySDCPN(prevNet.sdcpn)) {
          const next = { ...prev };
          delete next[previousNetIdToRemove];
          return next;
        }
        return prev;
      });
    }
    setActiveHandle(createActiveHandle(netToLoad));
    setCurrentNetId(petriNetId);
    if (petriNetId !== currentNetId) {
      clearSharedLocation();
    }
  };

  const setTitle = (title: string) => {
    if (!currentNetId || !currentNet) {
      return;
    }

    const lastUpdated = new Date().toISOString();

    setStoredSDCPNs((prev) =>
      produce(prev, (draft) => {
        const existing = draft[currentNetId];
        if (existing) {
          existing.title = title;
          existing.lastUpdated = lastUpdated;
        } else {
          const next: SDCPNInLocalStorage = {
            ...currentNet,
            title,
            lastUpdated,
          };
          draft[currentNetId] = castDraft(next);
        }
      }),
    );
  };

  const preparedFixtureIsCurrent =
    crewReservationFixtureSelected && currentNetId === fixtureDocumentId;
  const tracerIsCurrent = preparedFixtureIsCurrent && rootArcTracerSelected;
  const fixtureConfiguration = preparedFixtureIsCurrent
    ? crewReservationFixtureConfiguration
    : undefined;
  const conversationId =
    currentNetId === null
      ? null
      : currentNetId === workedModel.copy?.documentId
        ? workedModel.copy.conversationId
        : productConstructionSelected &&
            activeHandle?.fallbackNet.incarnationId !== undefined
          ? ordinaryConstructionConversationIdFrom(
              activeHandle.fallbackNet.incarnationId,
            )
          : tracerIsCurrent && activeHandle?.fallbackNet.incarnationId
            ? `${rootCreationSelected ? "root-creation-candidate-v1" : constructionSelected ? "construction-candidate-v1" : "prepared-root-arc"}:${activeHandle.fallbackNet.incarnationId}`
            : (fixtureConfiguration?.conversationId ??
              getOrCreateBrunchConversationId(currentNetId));
  const flueClientPromise = useMemo(
    () =>
      brunchSelected && conversationId !== null
        ? createBrunchFlueClient(conversationId, () =>
            activeHandle?.handle.revisionId.get(),
          )
        : null,
    [activeHandle, brunchSelected, conversationId],
  );
  const conversationTracker = useMemo(
    // Correlation state belongs to one conversation and must not cross a net switch.
    () => createConversationTrackerFor(conversationId),
    [conversationId],
  );
  // Failures the host contains — a stopped batch operation, an unrecordable
  // transition, a lost history observation, a failed server tool — resolve
  // normally for the panel and the model; this is where they become visible.
  const { captureException } = use(ErrorTrackerContext);
  const reportBrunchFailure = useCallback(
    (
      source: string,
      error: unknown,
      tags?: Readonly<Record<string, string | number | boolean>>,
    ) =>
      captureException(error, {
        source: `brunch.${source}`,
        ...(tags === undefined ? {} : { tags }),
      }),
    [captureException],
  );
  const rootArcBrowser = useMemo(() => {
    const net = activeHandle?.fallbackNet;
    if (!activeHandle || !conversationId || !net?.incarnationId)
      return undefined;
    if (productConstructionSelected) {
      return {
        binding: {
          conversationId,
          documentId: activeHandle.netId,
          incarnationId: net.incarnationId,
        },
        construction: true as const,
      };
    }
    if (
      !tracerIsCurrent ||
      (!constructionSelected && !net.rootArcRequestedBaseHash)
    )
      return undefined;
    return {
      binding: {
        conversationId,
        documentId: activeHandle.netId,
        incarnationId: net.incarnationId,
      },
      ...(constructionSelected
        ? { construction: true as const }
        : { requestedBaseHash: net.rootArcRequestedBaseHash! }),
    };
  }, [
    tracerIsCurrent,
    activeHandle,
    conversationId,
    constructionSelected,
    productConstructionSelected,
  ]);
  // The handle mutates behind a stable identity. Subscribe to its real snapshot;
  // a render-time read alone can be memoized by React Compiler across hand edits.
  const observedLiveHash = useSyncExternalStore(
    (changed) =>
      rootArcBrowser && activeHandle
        ? activeHandle.handle.subscribe(changed)
        : () => {},
    () =>
      rootArcBrowser && activeHandle?.handle.doc()
        ? observeBrowserDefinition(activeHandle.handle).sha256
        : undefined,
    () => undefined,
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
    batchedConstructionSelected
      ? batchedConstructionDynamicToolNames
      : undefined,
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
        openAIVoiceConfig,
        conversationTracker,
        flueHistory.settlements,
      ),
    [conversationTracker, flueHistory.settlements, openAIVoiceConfig],
  );
  const crewReservationSession = useCrewReservationFixtureSession({
    clientPromise: flueClientPromise,
    definition: storedSDCPNs[crewReservationDocumentId]?.sdcpn,
    enabled: fixtureConfiguration !== undefined && !tracerIsCurrent,
    history: flueHistory.snapshot,
    historyError: flueHistory.error?.message,
    persistCoherentSnapshot: persistCrewReservationSnapshot,
    refreshHistory: flueHistory.refresh,
    setSettledManifest,
    settledManifest,
    snapshotMissing: crewReservationBundle?.snapshotMissing ?? false,
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
          ...(batchedConstructionSelected
            ? {
                dynamicClientToolNames: batchedConstructionDynamicToolNames,
              }
            : {}),
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

  const aiAssistant = useMemo(
    () => ({
      additionalTab: rootArcBrowser
        ? {
            label: "Workpiece",
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
      ...(conversationId === null ? {} : { conversationId }),
      canClearMessages: flueClientPromise === null,
      automaticTools:
        batchedConstructionSelected && rootArcBrowser
          ? [
              createMutatePetrinetAutomaticTool(rootArcBrowser.binding, {
                retainAttempt: mutationRecorder?.retainAttempt,
                onOperationFailure: (failure) =>
                  reportBrunchFailure("mutate-petrinet", failure.error, {
                    toolCallId: failure.toolCallId,
                    operationId: failure.operationId,
                    operationType: failure.operationType,
                    status: failure.status,
                  }),
              }),
            ]
          : [],
      interactiveTools: [],
      transport: petrinautAiChatTransport,
      ...(flueClientPromise === null
        ? {}
        : { toolAliases: brunchPetrinautToolAliases }),
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
    }),
    [
      aiMessagesByNetId,
      brunchVoiceMode,
      batchedConstructionSelected,
      constructionSelected,
      observedLiveHash,
      productConstructionSelected,
      rootArcBrowser,
      conversationTracker,
      conversationId,
      currentNetId,
      flueClientPromise,
      flueHistory.messages,
      flueHistory.snapshot,
      petrinautAiChatTransport,
      reportBrunchFailure,
      mutationRecorder,
      setAiMessagesByNetId,
    ],
  );

  if (!currentNet) {
    return null;
  }

  if (!activeHandle || activeHandle.netId !== currentNet.id) {
    return null;
  }

  return (
    <div
      style={{
        height: "100vh",
        position: "relative",
        width: "100vw",
      }}
    >
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
            currentWorkpiece={crewReservationSession.currentWorkpiece}
            settledManifest={settledManifest}
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
              title={currentNet.title}
              viewportActions={[sentryFeedbackAction]}
            />
          </WalkthroughProvider>
          <DemoCommands
            createNewNet={createNewNet}
            createCleanWorkedModelCopy={
              workedModelSelected ? workedModel.createCleanCopy : undefined
            }
            brunchSelected={brunchSelected}
            selectAssistant={selectAssistant}
          />
          <CommandPalette />
        </CommandRegistryProvider>
      </UserSettingsProvider>
    </div>
  );
};
