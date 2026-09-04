/**
 * @layerRoot website.local-storage-demo
 * @role Editable demo shell: nets in local storage, one live document handle
 */

import { createFlueClient, type FlueConversationSettlement } from "@flue/sdk";
import { produce } from "immer";
import { useEffect, useMemo, useState } from "react";

import {
  agentOwnershipHeaders,
  flueConversationIdWeb,
} from "@hashintel/brunch-agent-transport-aisdk";
import {
  createJsonDocHandle,
  type MinimalNetMetadata,
  type PetrinautDocHandle,
  type PetrinautHandleCapabilities,
  type SDCPN,
} from "@hashintel/petrinaut-core";
import {
  CommandRegistryProvider,
  useCommand,
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
import { getOrCreateBrunchConversationId } from "./brunch-conversation-id";
import {
  BrunchPanelConversationTracker,
  createBrunchPanelTransport,
} from "./brunch-panel-transport";
import { resolveBrunchPreviewConfig } from "./brunch-preview-config";
import { getOrCreateBrunchPrincipal } from "./brunch-principal";
import { useFlueChatHistory } from "./use-flue-chat-history";
import { useLocalStorageAiMessages } from "./use-local-storage-ai-messages";
import {
  type SDCPNInLocalStorage,
  useLocalStorageSDCPNs,
} from "./use-local-storage-sdcpns";
import { walkthroughSteps } from "./walkthrough/walkthrough-steps";

import type { SharedExampleSearch } from "../../../examples/example-search";

const isEmptySDCPN = (sdcpn: SDCPN) =>
  sdcpn.places.length === 0 &&
  sdcpn.transitions.length === 0 &&
  sdcpn.types.length === 0 &&
  sdcpn.parameters.length === 0 &&
  sdcpn.differentialEquations.length === 0 &&
  (sdcpn.subnets ?? []).length === 0 &&
  (sdcpn.componentInstances ?? []).length === 0 &&
  (sdcpn.scenarios ?? []).length === 0 &&
  (sdcpn.metrics ?? []).length === 0;

const emptySDCPN: SDCPN = {
  places: [],
  transitions: [],
  types: [],
  parameters: [],
  differentialEquations: [],
};

const createDefaultStoredSDCPN = (): SDCPNInLocalStorage => ({
  id: "net-1",
  title: "New Process",
  sdcpn: emptySDCPN,
  lastUpdated: new Date(0).toISOString(),
});

/**
 * Creates the localStorage record for a newly created net, keeping the generated
 * id and last-updated timestamp in sync.
 */
const createLocalStorageNetRecord = (params: {
  petriNetDefinition: SDCPN;
  title: string;
}): SDCPNInLocalStorage => {
  const now = new Date();

  return {
    id: `net-${now.getTime()}`,
    title: params.title,
    sdcpn: params.petriNetDefinition,
    lastUpdated: now.toISOString(),
  };
};

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
): PetrinautAiVoiceMode | undefined =>
  config
    ? (context: PetrinautAiVoiceModeContext) => (
        <VoiceInterviewControl
          {...context}
          config={config}
          settlements={settlements}
          resolveInputSubmission={(messageId) =>
            tracker?.submissionForInput(messageId)
          }
          resolveResponseSubmission={(messageId) =>
            tracker?.submissionsForResponse(messageId)
          }
          subscribeToResponseMessageCompleted={
            tracker === undefined
              ? undefined
              : (listener) =>
                  tracker.subscribeToResponseMessageCompleted(listener)
          }
          subscribeToResponseMessageStarted={
            tracker === undefined
              ? undefined
              : (listener) =>
                  tracker.subscribeToResponseMessageStarted(listener)
          }
          subscribeToStopRequested={
            tracker === undefined
              ? undefined
              : (listener) => tracker.subscribeToStopRequested(listener)
          }
          subscribeToAdmission={
            tracker === undefined
              ? undefined
              : (target, listener) =>
                  tracker.subscribeToAdmission(target, ({ admission }) =>
                    listener(admission.submissionId),
                  )
          }
          subscribeToAdmissionFailure={
            tracker === undefined
              ? undefined
              : (target, listener) =>
                  tracker.subscribeToAdmissionFailure(target, listener)
          }
        />
      )
    : undefined;

const createHandle = (net: SDCPNInLocalStorage): PetrinautDocHandle =>
  createJsonDocHandle({
    id: net.id,
    initial: net.sdcpn,
    capabilities: DEMO_CAPABILITIES,
  });

const brunchPrincipal = getOrCreateBrunchPrincipal();

const stockChatTransport = new DefaultChatTransport({
  api: brunchPreviewConfig.chatEndpoint,
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
    headers: agentOwnershipHeaders(identity),
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
): Record<string, SDCPNInLocalStorage> => {
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

const createActiveHandle = (net: SDCPNInLocalStorage): ActiveHandle => ({
  handle: createHandle(net),
  netId: net.id,
  fallbackNet: net,
});

/**
 * The demo's own palette command, registered beside Petrinaut's: picking it
 * in the palette starts a fresh net.
 */
const DemoCommands = ({
  createNewNet,
}: {
  createNewNet: (params: { petriNetDefinition: SDCPN; title: string }) => void;
}) => {
  useCommand({
    id: "demo.net.new",
    label: "Create a new empty net",
    category: "Demo",
    keywords: ["file"],
    run: () =>
      createNewNet({ petriNetDefinition: emptySDCPN, title: "New Process" }),
  });
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
  const [openAIVoiceConfig, setOpenAIVoiceConfig] = useState<
    OpenAIVoiceConfig | null | undefined
  >(() => (brunchPreviewConfig.isBrunchConfigured ? undefined : null));
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
  const storedSDCPNsForDisplay = getStoredSDCPNsForDisplay(storedSDCPNs);

  useEffect(() => {
    if (!brunchPreviewConfig.isBrunchConfigured) {
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
  }, []);

  // Pick the most recently modified net
  const mostRecentlyModifiedNet =
    Object.values(storedSDCPNsForDisplay).sort(
      (a, b) =>
        new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime(),
    )[0] ?? null;

  // The net currently selected in the UI.
  const [currentNetId, setCurrentNetId] = useState<string | null>(
    () => mostRecentlyModifiedNet?.id ?? null,
  );

  // Metadata and persisted SDCPN snapshot for the selected net.
  const currentNet = currentNetId
    ? (storedSDCPNsForDisplay[currentNetId] ?? null)
    : null;

  // Live editable document handle for the selected net only.
  const [activeHandle, setActiveHandle] = useState<ActiveHandle | null>(() =>
    mostRecentlyModifiedNet
      ? createActiveHandle(mostRecentlyModifiedNet)
      : null,
  );

  useEffect(() => {
    if (!activeHandle) {
      return;
    }

    const { fallbackNet, handle, netId } = activeHandle;

    return handle.subscribe((event) => {
      const lastUpdated = new Date().toISOString();

      setStoredSDCPNs((prev) => {
        const stored = prev[netId] ?? fallbackNet;

        return produce(prev, (draft) => {
          draft[netId] = {
            ...stored,
            sdcpn: event.next,
            lastUpdated,
          };
        });
      });
    });
  }, [activeHandle, setStoredSDCPNs]);

  const existingNets: MinimalNetMetadata[] = Object.values(storedSDCPNs)
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
        draft[currentNetId] = {
          ...(draft[currentNetId] ?? currentNet),
          title,
          lastUpdated,
        };
      }),
    );
  };

  const conversationId = currentNetId
    ? getOrCreateBrunchConversationId(currentNetId)
    : null;
  const flueClientPromise = useMemo(
    () =>
      brunchPreviewConfig.isBrunchConfigured && conversationId !== null
        ? createBrunchFlueClient(conversationId)
        : null,
    [conversationId],
  );
  const conversationTracker = useMemo(
    // Correlation state belongs to one conversation and must not cross a net switch.
    () => createConversationTrackerFor(conversationId),
    [conversationId],
  );
  const flueHistory = useFlueChatHistory(
    flueClientPromise,
    conversationId ?? "",
  );
  const brunchVoiceMode = useMemo(
    () =>
      getBrunchVoiceMode(
        openAIVoiceConfig,
        conversationTracker,
        flueHistory.settlements,
      ),
    [conversationTracker, flueHistory.settlements, openAIVoiceConfig],
  );
  const petrinautAiChatTransport = useMemo(
    () =>
      flueClientPromise === null
        ? stockChatTransport
        : createBrunchPanelTransport(flueClientPromise, conversationTracker, {
            onAdmission: flueHistory.refresh,
          }),
    [conversationTracker, flueClientPromise, flueHistory.refresh],
  );

  const aiAssistant = useMemo(
    () => ({
      ...(conversationId === null ? {} : { conversationId }),
      canClearMessages: flueClientPromise === null,
      interactiveTools: [],
      transport: petrinautAiChatTransport,
      ...(flueClientPromise === null
        ? {}
        : {
            requestStop: () =>
              requestFlueStop(flueClientPromise, conversationTracker),
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
      conversationTracker,
      conversationId,
      currentNetId,
      flueClientPromise,
      flueHistory.messages,
      petrinautAiChatTransport,
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
    <div style={{ height: "100vh", width: "100vw" }}>
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
        <DemoCommands createNewNet={createNewNet} />
        <CommandPalette />
      </CommandRegistryProvider>
    </div>
  );
};
